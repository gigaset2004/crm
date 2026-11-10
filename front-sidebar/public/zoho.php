<?php
declare(strict_types=1);
ini_set('display_errors', '0');
header('Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('X-LiteSpeed-Cache-Control: no-cache');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
$action = $_GET['action'] ?? 'status';
function respond(array $data, int $status = 200): void {
    http_response_code($status); header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit;
}
if ($action === 'health') {
    $health = ['service'=>'MinMax Front Zoho','php'=>true,'curl'=>function_exists('curl_init'),'storage_writable'=>is_writable(__DIR__.'/.zoho-private')];
    if (function_exists('curl_init')) {
        $probe = curl_init('https://accounts.zoho.com/.well-known/openid-configuration');
        curl_setopt_array($probe,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>10,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2]);
        curl_exec($probe); $health['zoho_http']=(int)curl_getinfo($probe,CURLINFO_HTTP_CODE);$health['curl_errno']=curl_errno($probe);curl_close($probe);
    }
    respond($health);
}
$storage = __DIR__ . '/.zoho-private';
define('MINMAX_ZOHO_INTERNAL', true);
if (!is_file($storage . '/config.php')) respond(['error'=>'Zoho is not configured yet.'], 503);
$config = require $storage . '/config.php';
function fileKey(string $kind, string $id): string { global $storage; return $storage . '/' . $kind . '-' . hash('sha256', $id) . '.php'; }
function readPrivate(string $path): array { return is_file($path) ? (require $path) : []; }
function writePrivate(string $path, array $data): void {
    $tmp = $path . '.' . bin2hex(random_bytes(8)) . '.php';
    $content = '<?php if (!defined("MINMAX_ZOHO_INTERNAL")) { http_response_code(404); exit; } return ' . var_export($data, true) . ';';
    if (file_put_contents($tmp, $content, LOCK_EX) === false) throw new RuntimeException('storage');
    chmod($tmp, 0600); if (!rename($tmp, $path)) throw new RuntimeException('storage');
}
function freshSession(array &$session, string $sessionPath, array $config): void {
    $lock=fopen($sessionPath.'.lock','c');
    if(!$lock||!flock($lock,LOCK_EX))throw new RuntimeException('storage');
    try{
    $session=readPrivate($sessionPath);
    if(($session['expires']??0)<time())throw new RuntimeException('reauthorize');
    // Sliding expiry: keep a used connection, but expire after 30 idle days.
    if(($session['expires']??0)<time()+29*86400){$session['expires']=time()+30*86400;writePrivate($sessionPath,$session);}
    if (($session['access_expires'] ?? 0) >= time()) return;
    $new = requestZoho('https://accounts.zoho.com/oauth/v2/token', ['grant_type'=>'refresh_token','client_id'=>$config['client_id'],'client_secret'=>$config['client_secret'],'refresh_token'=>$session['refresh_token']]);
    if (empty($new['access_token'])) throw new RuntimeException('reauthorize');
    $session['access_token']=$new['access_token'];
    $session['access_expires']=time()+max(60,(int)($new['expires_in']??3600))-60;
    writePrivate($sessionPath,$session);
    }finally{flock($lock,LOCK_UN);fclose($lock);}
}
function requestZoho(string $url, ?array $form = null, ?string $token = null, string $method = 'GET', ?array $json = null, array $extraHeaders = []): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_CONNECTTIMEOUT=>10, CURLOPT_TIMEOUT=>25, CURLOPT_FOLLOWLOCATION=>false, CURLOPT_SSL_VERIFYPEER=>true, CURLOPT_SSL_VERIFYHOST=>2]);
    if ($form !== null) curl_setopt_array($ch, [CURLOPT_POST=>true, CURLOPT_POSTFIELDS=>http_build_query($form)]);
    if ($method !== 'GET') curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    $headers=$extraHeaders;
    if ($token !== null) $headers[]='Authorization: Zoho-oauthtoken ' . $token;
    if ($json !== null) { $headers[]='Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($json, JSON_UNESCAPED_UNICODE)); }
    if ($headers) curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $body = curl_exec($ch); $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    if ($body === false || $status === 0) throw new RuntimeException('network');
    if ($status === 204) return [];
    $data = json_decode($body, true);
    if (!is_array($data)) throw new RuntimeException('response');
    if ($status >= 400 || isset($data['error'])) {
        $code = (string)($data['error'] ?? $data['code'] ?? '');
        $allowed = ['invalid_client','invalid_client_secret','invalid_code','invalid_redirect_uri','OAUTH_SCOPE_MISMATCH','NO_PERMISSION','INVALID_TOKEN'];
        throw new RuntimeException(in_array($code, $allowed, true) ? $code : ($status === 401 ? 'reauthorize' : 'zoho_http_' . $status));
    }
    return $data;
}
function cleanTicket(string $ticket): string { if (!preg_match('/^[a-f0-9]{64}$/D', $ticket)) respond(['error'=>'Please connect to Zoho.'], 401); return $ticket; }
function frontParticipants(string $id, bool $refresh): array {
    global $storage;
    if (!preg_match('/^cnv_[a-z0-9]+$/Di', $id)) respond(['error'=>'Invalid Front conversation.'],400);
    $path=fileKey('front-participants-v1',$id);
    $lock=fopen($path.'.lock','c');
    if(!$lock||!flock($lock,LOCK_EX))throw new RuntimeException('storage');
    try {
        $cached=readPrivate($path);
        if(!$refresh&&($cached['expires']??0)>time()&&($cached['complete']??false))return $cached;
        $credentials=readPrivate($storage.'/front-token.php');
        $token=$credentials['token']??'';
        if(!$token)throw new RuntimeException('front_not_configured');
        $url='https://api2.frontapp.com/conversations/'.$id.'/messages?limit=100';
        $seen=[];$people=[];$count=0;$pages=0;
        $deadline=microtime(true)+100;
        while($url){
            $parts=parse_url($url);
            if(($parts['scheme']??'')!=='https'||($parts['host']??'')!=='api2.frontapp.com'||isset($parts['user'])||isset($parts['pass'])||isset($parts['port'])||!preg_match('~^/conversations/cnv_[a-z0-9]+/messages$~Di',$parts['path']??'')||isset($seen[$url])||++$pages>1000||microtime(true)>$deadline)throw new RuntimeException('front_incomplete');
            $seen[$url]=true;
            $ch=curl_init($url);
            curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>25,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$token,'Accept: application/json']]);
            $raw=curl_exec($ch);$status=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);curl_close($ch);
            if($raw===false||$status!==200)throw new RuntimeException('front_unavailable');
            $page=json_decode($raw,true);unset($raw);
            if(!is_array($page)||!isset($page['_results'])||!is_array($page['_results']))throw new RuntimeException('front_incomplete');
            foreach($page['_results'] as $message){
                $count++;
                foreach(($message['recipients']??[]) as $person){
                    $handle=strtolower(trim((string)($person['handle']??'')));
                    if(!$handle)continue;
                    $email=filter_var($handle,FILTER_VALIDATE_EMAIL)!==false;
                    if($email&&(in_array(substr(strrchr($handle,'@'),1),['minmaxdeals.com','exporters.sg'],true)||$handle==='3249bln_kq4g6ke@mails5.zohocrm.com'))continue;
                    $type=$email?'email':'phone';
                    if(!$email&&!preg_match('/^(?:whatsapp:)?[+0-9\s().-]{8,30}$/Di',$handle))continue;
                    $people[$type.':'.$handle]=['type'=>$type,'handle'=>$handle,'name'=>(string)($person['name']??'')];
                }
            }
            $url=$page['_pagination']['next']??null;
            if($url!==null&&!is_string($url))throw new RuntimeException('front_incomplete');
        }
        $result=['recipients'=>array_values($people),'complete'=>true,'messages_scanned'=>$count,'pages_scanned'=>$pages,'expires'=>time()+120];
        writePrivate($path,$result);
        return $result;
    } finally {flock($lock,LOCK_UN);fclose($lock);}
}

/* Front Sidebar 2.0 — conversation-bound order read and Blueprint actions. */
function frontConversationId(string $id): string {
    if (!preg_match('/^cnv_[a-z0-9]{5,40}$/iD', $id)) respond(['error'=>'Invalid Front conversation ID.'],400);
    return $id;
}
function frontOrderModule(string $module): string {
    if (!in_array($module, ['Sales_Orders','Purchase_Orders','Shipments'], true)) respond(['error'=>'Unsupported CRM module.'],400);
    return $module;
}
function frontRecordMatches(array $record, string $conversation): bool {
    $raw=(string)($record['Front_Conversation_ID']??'');
    return in_array($conversation, preg_split('/[\s,;]+/', trim($raw)) ?: [], true);
}
function frontOrderSummary(string $module, array $row): array {
    $owner=$row['Owner']??null;
    $company=$module==='Sales_Orders'?($row['Account_Name']??null):($row['Vendor_Name']??null);
    return [
        'id'=>(string)($row['id']??''),'module'=>$module,
        'name'=>(string)($row['Subject']??$row['Name']??$row['Shipment_Name']??$row['Shipment_Number']??$row['id']??''),
        'status'=>(string)($row[$module==='Shipments'?'Shipment_Status':'Status']??''),
        'type'=>(string)($row['Shipment_Type']??''),
        'created'=>(string)($row['Created_Time']??''),
        'total'=>$row['Grand_Total']??null,
        'quantity'=>$row['Total_Ordered_Qty']??null,
        'party'=>is_array($company)?(string)($company['name']??''):'',
        'owner'=>is_array($owner)?(string)($owner['name']??''):'',
        'crm_tab'=>$module==='Sales_Orders'?'SalesOrders':($module==='Purchase_Orders'?'PurchaseOrders':'CustomModule11')
    ];
}
function frontBlueprintFields(array $transition): array {
    $result=[];
    foreach (($transition['fields']??[]) as $field) {
        if (!is_array($field)) continue;
        $values=[];
        foreach (($field['pick_list_values']??[]) as $option) {
            $value=(string)($option['actual_value']??'');
            if ($value==='' || $value==='-None-') continue;
            $values[]=['value'=>$value,'label'=>(string)($option['display_value']??$value)];
        }
        $result[]=[
            'api_name'=>(string)($field['api_name']??''),
            'label'=>(string)($field['display_label']??$field['field_label']??''),
            'data_type'=>(string)($field['data_type']??''),
            'mandatory'=>($field['$optional']??$field['optional']??true)===false || ($field['mandatory']??false)===true,
            'content'=>$field['content']??null,
            'options'=>$values,
            'kind'=>(string)($field['_type']??'fields')
        ];
    }
    return $result;
}
function frontSupportedBlueprintField(array $field): bool {
    return ($field['kind']??'')==='fields'
        && preg_match('/^[A-Za-z][A-Za-z_0-9]{0,100}$/D',(string)($field['api_name']??''))===1
        && in_array((string)($field['data_type']??''),['picklist','text','textarea','multiline','email','phone','website','integer','double','currency','percent','date','datetime','boolean','checkbox'],true);
}

try {
    if ($action === 'start') {
        $ticket = cleanTicket((string)($_GET['ticket'] ?? ''));
        $state = bin2hex(random_bytes(32));
        writePrivate(fileKey('state', $state), ['ticket'=>$ticket, 'expires'=>time()+600]);
        setcookie('minmax_zoho_state', $state, ['expires'=>time()+600, 'path'=>'/front-app/', 'secure'=>true, 'httponly'=>true, 'samesite'=>'Lax']);
        $scope = 'ZohoCRM.coql.READ,ZohoCRM.modules.salesorders.READ,ZohoCRM.modules.salesorders.UPDATE,ZohoCRM.modules.purchaseorders.READ,ZohoCRM.modules.purchaseorders.UPDATE,ZohoCRM.modules.custom.UPDATE,ZohoCRM.modules.leads.READ,ZohoCRM.modules.contacts.READ,ZohoCRM.modules.accounts.READ,ZohoCRM.modules.vendors.READ,ZohoCRM.modules.custom.READ,ZohoCRM.modules.leads.UPDATE,ZohoCRM.modules.contacts.UPDATE,ZohoCRM.modules.leads.CREATE,ZohoCRM.modules.contacts.CREATE,ZohoCRM.users.READ,ZohoSearch.securesearch.READ';
        $query = http_build_query(['client_id'=>$config['client_id'], 'redirect_uri'=>$config['redirect_uri'], 'scope'=>$scope, 'response_type'=>'code', 'access_type'=>'offline', 'prompt'=>'consent', 'state'=>$state]);
        header('Location: https://accounts.zoho.com/oauth/v2/auth?' . $query); exit;
    }
    if ($action === 'callback') {
        $state = cleanTicket((string)($_GET['state'] ?? ''));
        if (!hash_equals((string)($_COOKIE['minmax_zoho_state'] ?? ''), $state)) respond(['error'=>'Start the Zoho connection again from the app.'], 403);
        $pendingPath = fileKey('state', $state); $pending = readPrivate($pendingPath);
        if (($pending['expires'] ?? 0) < time()) respond(['error'=>'The connection link expired. Start again from the app.'], 400);
        if (isset($_GET['error'])) respond(['error'=>'Zoho access was not approved.'], 400);
        $accounts = (string)($_GET['accounts-server'] ?? 'https://accounts.zoho.com');
        if ($accounts !== 'https://accounts.zoho.com') respond(['error'=>'This app is configured for the Zoho US region.'], 400);
        $tokens = requestZoho($accounts . '/oauth/v2/token', ['grant_type'=>'authorization_code','client_id'=>$config['client_id'],'client_secret'=>$config['client_secret'],'redirect_uri'=>$config['redirect_uri'],'code'=>(string)($_GET['code'] ?? '')]);
        if (empty($tokens['access_token'])) throw new RuntimeException('missing_access_token');
        if (empty($tokens['refresh_token'])) throw new RuntimeException('missing_refresh_token');
        $tokens['api_domain'] = rtrim((string)($tokens['api_domain'] ?? ''), '/');
        if ($tokens['api_domain'] !== 'https://www.zohoapis.com') throw new RuntimeException('unexpected_api_domain');
        writePrivate(fileKey('session', $pending['ticket']), ['access_token'=>$tokens['access_token'],'refresh_token'=>$tokens['refresh_token'],'api_domain'=>$tokens['api_domain'],'access_expires'=>time()+max(60,(int)($tokens['expires_in'] ?? 3600))-60,'expires'=>time()+30*86400]);
        unlink($pendingPath);
        setcookie('minmax_zoho_state', '', ['expires'=>1,'path'=>'/front-app/','secure'=>true,'httponly'=>true,'samesite'=>'Lax']);
        header('Content-Type: text/html; charset=utf-8');
        header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'");
        echo '<!doctype html><html lang="en"><meta charset="utf-8"><title>Zoho connected</title><body style="font-family:system-ui;padding:48px"><h1>Zoho CRM connected</h1><p>Return to Front. You can close this tab.</p></body></html>'; exit;
    }
    $header = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    $ticket = cleanTicket(preg_replace('/^Bearer\s+/i', '', $header));
    $sessionPath = fileKey('session', $ticket); $session = readPrivate($sessionPath);
    if (($session['expires'] ?? 0) < time()) respond(['error'=>'Please connect to Zoho to view records.'], 401);
    if ($action === 'status') respond(['connected'=>true]);
    if ($action === 'participants') {
        try {respond(frontParticipants((string)($_GET['conversation_id']??''),($_GET['refresh']??'')==='1'));}
        catch(Throwable $error){respond(['error'=>'Could not load all Front conversation participants. Please refresh or check Front API access.'],502);}
    }
    freshSession($session,$sessionPath,$config);

    if (in_array($action,['conversation_records','record_blueprint','blueprint_transition'],true)) {
        $conversation=frontConversationId((string)($_GET['conversation_id']??''));
        if ($action==='conversation_records') {
            if (($_SERVER['REQUEST_METHOD']??'GET')!=='GET') respond(['error'=>'GET required.'],405);
            $output=['sales_orders'=>[],'purchase_orders'=>[],'shipments'=>[],'errors'=>[]];
            foreach ([['Sales_Orders','sales_orders'],['Purchase_Orders','purchase_orders']] as [$module,$key]) {
                try {
                    $query="select id, Subject, Status, Created_Time, Grand_Total, Owner, Front_Conversation_ID from ".$module." where Front_Conversation_ID = '".$conversation."' limit 0, 100";
                    $rows=requestZoho($session['api_domain'].'/crm/v8/coql',null,$session['access_token'],'POST',['select_query'=>$query]);
                    foreach (($rows['data']??[]) as $row) if (is_array($row) && frontRecordMatches($row,$conversation)) $output[$key][]=frontOrderSummary($module,$row);
                } catch (Throwable $e) { $output['errors'][$key]=$e->getMessage()==='OAUTH_SCOPE_MISMATCH'?'reconnect':'unavailable'; }
            }
            try {
                // Front_Conversation_ID is a textarea: standard Search 'contains' is rejected by Zoho.
                // COQL is attempted first; linked POs provide a second discovery path.
                $found=[];
                try {
                    $query="select id, Name, Shipment_Status, Shipment_Type, Created_Time, Owner, Front_Conversation_ID from Shipments where Front_Conversation_ID like '%".$conversation."%' limit 0, 100";
                    $search=requestZoho($session['api_domain'].'/crm/v8/coql',null,$session['access_token'],'POST',['select_query'=>$query]);
                    foreach (($search['data']??[]) as $row) if(is_array($row) && frontRecordMatches($row,$conversation))$found[(string)$row['id']]=$row;
                } catch (Throwable $ignored) {}
                foreach (array_slice($output['purchase_orders'],0,50) as $po) {
                    $poId=(string)$po['id'];
                    if(!preg_match('/^[0-9]{10,25}$/D',$poId))continue;
                    try {
                        $query="select id, Shipment, Purchase_Order from Shipment_PO_Links where Purchase_Order = '".$poId."' limit 0, 100";
                        $links=requestZoho($session['api_domain'].'/crm/v8/coql',null,$session['access_token'],'POST',['select_query'=>$query]);
                        foreach (($links['data']??[]) as $link) {
                            $shipmentId=(string)($link['Shipment']['id']??'');
                            if(!preg_match('/^[0-9]{10,25}$/D',$shipmentId)||isset($found[$shipmentId]))continue;
                            $detail=requestZoho($session['api_domain'].'/crm/v8/Shipments/'.$shipmentId,null,$session['access_token']);
                            $record=$detail['data'][0]??[];
                            if(is_array($record)&&frontRecordMatches($record,$conversation))$found[$shipmentId]=$record;
                        }
                    } catch (Throwable $ignored) {}
                }
                foreach ($found as $row)$output['shipments'][]=frontOrderSummary('Shipments',$row);
            } catch (Throwable $e) { $output['errors']['shipments']=$e->getMessage()==='OAUTH_SCOPE_MISMATCH'?'reconnect':'unavailable'; }
            respond($output);
        }
        $module=frontOrderModule((string)($_GET['module']??''));
        $id=(string)($_GET['id']??'');
        if (!preg_match('/^[0-9]{10,25}$/D',$id)) respond(['error'=>'Invalid CRM record ID.'],400);
        $path=$session['api_domain'].'/crm/v8/'.$module.'/'.$id;
        $detail=requestZoho($path,null,$session['access_token']);
        $record=$detail['data'][0]??null;
        if (!is_array($record) || !frontRecordMatches($record,$conversation)) respond(['error'=>'CRM record is not linked to this conversation.'],403);
        $bp=requestZoho($path.'/actions/blueprint',null,$session['access_token']);
        $transitions=$bp['blueprint']['transitions']??[];
        if ($action==='record_blueprint') {
            $list=[];
            foreach ($transitions as $transition) {
                if (!is_array($transition)||($transition['type']??'')!=='manual') continue;
                $fields=frontBlueprintFields($transition);
                $list[]=[
                    'id'=>(string)($transition['id']??''),
                    'name'=>(string)($transition['name']??''),
                    'next_status'=>(string)($transition['next_field_value']??''),
                    'available'=>($transition['criteria_matched']??false)===true && ($transition['state']??'open')==='open',
                    'criteria_message'=>(string)($transition['criteria_message']??''),
                    'fields'=>$fields,
                    'supported'=>!array_filter($fields,fn($field)=>!frontSupportedBlueprintField($field)),
                    'values'=>array_intersect_key($transition['data']??[],array_fill_keys(array_column($fields,'api_name'),true))
                ];
            }
            respond(['module'=>$module,'id'=>$id,'status'=>(string)($bp['blueprint']['process_info']['field_value']??''),'transitions'=>$list]);
        }
        if (($_SERVER['REQUEST_METHOD']??'')!=='POST') respond(['error'=>'POST required.'],405);
        $input=json_decode((string)file_get_contents('php://input'),true);
        if (!is_array($input)) respond(['error'=>'Invalid request.'],400);
        $transitionId=(string)($input['transition_id']??'');
        $data=$input['data']??[];
        if (!preg_match('/^[0-9]{10,25}$/D',$transitionId)||!is_array($data)||count($data)>30) respond(['error'=>'Invalid transition data.'],400);
        $selected=null;
        foreach ($transitions as $transition) {
            if ((string)($transition['id']??'')===$transitionId) {$selected=$transition;break;}
        }
        if (!is_array($selected) || ($selected['type']??'')!=='manual' || ($selected['criteria_matched']??false)!==true || ($selected['state']??'open')!=='open') respond(['error'=>'Transition is no longer available. Refresh the record.'],409);
        $fields=frontBlueprintFields($selected);
        $allowed=[];
        foreach ($fields as $field) {
            if (!frontSupportedBlueprintField($field)) respond(['error'=>'This transition requires Zoho CRM. Open the record there.'],422);
            $allowed[$field['api_name']]=$field;
        }
        foreach ($data as $name=>$value) {
            if (!isset($allowed[$name])||(!is_scalar($value)&&$value!==null)) respond(['error'=>'Unsupported transition value.'],400);
            $type=$allowed[$name]['data_type'];
            if ($type==='boolean'||$type==='checkbox') {
                if (!in_array($value,[true,false,0,1,'0','1'],true)) respond(['error'=>'Invalid checkbox value.'],400);
                $data[$name]=filter_var($value,FILTER_VALIDATE_BOOLEAN);
            } else {
                $value=trim((string)$value);
                if (strlen($value)>2000) respond(['error'=>'Field value is too long.'],400);
                if ($type==='picklist' && !in_array($value,array_column($allowed[$name]['options'],'value'),true)) respond(['error'=>'Select a valid option.'],400);
                if (in_array($type,['integer','double','currency','percent'],true) && $value!=='' && !is_numeric($value)) respond(['error'=>'Invalid numeric value.'],400);
                if ($type==='date' && $value!=='' && !preg_match('/^\d{4}-\d{2}-\d{2}$/D',$value)) respond(['error'=>'Invalid date.'],400);
                $data[$name]=$value;
            }
        }
        foreach ($allowed as $name=>$field) {
            if ($field['mandatory'] && (!array_key_exists($name,$data) || $data[$name]==='' || $data[$name]===null)) respond(['error'=>'Complete all required Blueprint fields.'],400);
        }
        $result=requestZoho($path.'/actions/blueprint',null,$session['access_token'],'PUT',['blueprint'=>[['transition_id'=>$transitionId,'data'=>$data]]]);
        if (($result['status']??'')!=='success' || ($result['code']??'')!=='SUCCESS') respond(['error'=>'Zoho did not confirm this transition.'],502);
        $after=requestZoho($path,null,$session['access_token']);
        $updated=$after['data'][0]??[];
        respond(['ok'=>true,'record'=>frontOrderSummary($module,$updated)]);
    }

    if($action==='relation_update'){
        if(($_SERVER['REQUEST_METHOD']??'')!=='POST')respond(['error'=>'Use POST to update a relation.'],405);
        $input=json_decode((string)file_get_contents('php://input'),true);
        $module=$input['module']??'';$id=(string)($input['id']??'');
        if(!in_array($module,['Contacts','Leads'],true)||!preg_match('/^[0-9]{10,25}$/D',$id))respond(['error'=>'Invalid CRM record.'],400);
        $ids=$input['related_ids']??null;$expected=$input['expected_ids']??null;
        if(!is_array($ids)||!is_array($expected)||count($ids)>50||count($expected)>50)respond(['error'=>'Invalid relation selection.'],400);
        foreach(array_merge($ids,$expected) as $value)if(!is_string($value)||!preg_match('/^[0-9]{10,25}$/D',$value))respond(['error'=>'Invalid related record.'],400);
        $ids=array_values(array_unique($ids));$expected=array_values(array_unique($expected));
        $detail=requestZoho($session['api_domain'].'/crm/v8/'.$module.'/'.$id,null,$session['access_token']);$current=$detail['data'][0]??null;
        if(!$current)respond(['error'=>'CRM record not found.'],404);
        $type=(string)($current[$module==='Contacts'?'Contact_type':'Lead_type']??'');
        $target=$type==='Customer'?'Accounts':($type==='Supplier'?'Vendors':($module==='Contacts'&&in_array($type,['Warehouse','Broker','Carrier','Forwarder'],true)?'Logistics':''));
        if(!$target)respond(['error'=>'This record type has no editable company or provider link.'],400);
        $field=$target==='Logistics'?'Logistics_Services':($target==='Accounts'?($module==='Contacts'?'Account_Name':'Customer_Company'):($module==='Contacts'?'Vendor_Name':'Supplier_name'));
        $existing=[];$linkIds=[];
        if($target==='Logistics'){
            foreach(($current[$field]??[]) as $link){$child=$link['Logistics_Services']??$link;if(!empty($child['id'])){$childId=(string)$child['id'];$existing[]=$childId;if(isset($link['Logistics_Services'],$link['id']))$linkIds[$childId]=(string)$link['id'];}}
        }else{if(count($ids)!==1)respond(['error'=>'Select one CRM company.'],400);if(!empty($current[$field]['id']))$existing[]=(string)$current[$field]['id'];}
        $existing=array_values(array_unique($existing));$left=$existing;$right=$expected;sort($left);sort($right);
        if($left!==$right)respond(['error'=>'This link changed in CRM. Refresh the card before editing it.'],409);
        $related=null;$logistics=[];$nicknames=[];$selected=[];
        foreach($ids as $relatedId){
            $response=requestZoho($session['api_domain'].'/crm/v8/'.$target.'/'.$relatedId,null,$session['access_token']);$row=$response['data'][0]??null;
            if(!$row)respond(['error'=>'Selected CRM record was not found or is not accessible.'],400);
            $name=(string)($row[$target==='Accounts'?'Account_Name':($target==='Vendors'?'Vendor_Name':'Name')]??'Unnamed');
            $selected[$relatedId]=$name;
            if(!empty($row['Nickname']))$nicknames[]=(string)$row['Nickname'];
        }
        if($target==='Logistics'){
            $changes=[];
            foreach(array_diff($existing,$ids) as $removed){if(empty($linkIds[$removed]))respond(['error'=>'Could not safely identify the provider link. Refresh and try again.'],409);$changes[]=['id'=>$linkIds[$removed],'_delete'=>null];}
            foreach(array_diff($ids,$existing) as $added)$changes[]=['Logistics_Services'=>['id'=>$added]];
            $update=$changes?[$field=>$changes]:[];
        }else{$update=[$field=>['id'=>$ids[0]]];$related=['module'=>$target,'id'=>$ids[0],'label'=>$target==='Accounts'?'Account':'Vendor','name'=>$selected[$ids[0]]];}
        if($update){
            $headers=!empty($current['Modified_Time'])?['If-Unmodified-Since: '.$current['Modified_Time']]:[];
            $result=requestZoho($session['api_domain'].'/crm/v8/'.$module.'/'.$id,null,$session['access_token'],'PUT',['data'=>[$update]],$headers);
            if(($result['data'][0]['status']??'')!=='success')respond(['error'=>'CRM did not save the link. Refresh and try again.'],409);
        }
        // Read back the relation, never claim success based only on the write.
        $confirmed=requestZoho($session['api_domain'].'/crm/v8/'.$module.'/'.$id,null,$session['access_token']);$saved=$confirmed['data'][0]??[];
        $actual=[];
        if($target==='Logistics'){$logistics=$saved[$field]??[];foreach($logistics as $link){$child=$link['Logistics_Services']??$link;if(!empty($child['id']))$actual[]=(string)$child['id'];}}
        elseif(!empty($saved[$field]['id']))$actual[]=(string)$saved[$field]['id'];
        sort($actual);$wanted=$ids;sort($wanted);
        if($actual!==$wanted)respond(['error'=>'The CRM link could not be confirmed. Refresh the card to see its current value.'],409);
        respond(['ok'=>true,'related'=>$related,'logistics_services'=>$logistics,'nicknames'=>array_values(array_unique($nicknames))]);
    }
    if ($action === 'users') {
        $result=requestZoho($session['api_domain'].'/crm/v8/users?'.http_build_query(['type'=>'ActiveUsers','per_page'=>200]),null,$session['access_token']);
        $users=[];foreach(($result['users']??[]) as $user)if(($user['status']??'')==='active'&&!empty($user['id']))$users[]=['id'=>(string)$user['id'],'name'=>(string)($user['full_name']??$user['name']??''),'email'=>(string)($user['email']??'')];
        respond(['users'=>$users]);
    }
    if ($action === 'update') {
        $input=json_decode((string)file_get_contents('php://input'),true);
        if (!is_array($input) || !in_array($input['module']??'', ['Leads','Contacts'], true) || !preg_match('/^[0-9]{10,25}$/D',(string)($input['id']??''))) respond(['error'=>'Invalid record.'],400);
        $field=(string)($input['field']??''); $apiField=['Mobile'=>'Mobile','Phone'=>'Phone','Title'=>'Title'][$field]??'';
        if($field==='Owner'){
            $ownerId=(string)($input['value']??'');
            if(!preg_match('/^[0-9]{10,25}$/D',$ownerId))respond(['error'=>'Select an active CRM owner.'],400);
            $active=requestZoho($session['api_domain'].'/crm/v8/users?'.http_build_query(['type'=>'ActiveUsers','per_page'=>200]),null,$session['access_token']);
            $owner=null;foreach(($active['users']??[]) as $candidate)if((string)($candidate['id']??'')===$ownerId&&($candidate['status']??'')==='active'){$owner=$candidate;break;}
            if(!$owner)respond(['error'=>'That CRM owner is not active. Refresh the panel and try again.'],400);
            $result=requestZoho($session['api_domain'].'/crm/v8/'.$input['module'].'/'.$input['id'],null,$session['access_token'],'PUT',['data'=>[['Owner'=>['id'=>$ownerId]]]]);
            if(($result['data'][0]['status']??'')!=='success')throw new RuntimeException((string)($result['data'][0]['code']??'update_failed'));
            respond(['ok'=>true,'owner'=>(string)($owner['full_name']??$owner['name']??''),'owner_id'=>$ownerId]);
        }
        $value=trim((string)($input['value']??''));
        if ((!in_array($field,['Name','Mobile','Phone','Title'],true)) || ($field==='Name' && $value==='') || strlen($value)>($field==='Title'?400:255) || ($field==='Title'&&preg_match_all('/./us',$value)>100)) respond(['error'=>'Enter a valid value.'],400);
        $module=$input['module']; $id=$input['id'];
        if($field==='Name'){$parts=preg_split('/\s+/u',$value,2);$data=['Last_Name'=>trim((string)($parts[count($parts)-1]??'')),'First_Name'=>count($parts)>1?trim((string)$parts[0]):''];}
        else $data=[$apiField=>$value];
        $result=requestZoho($session['api_domain'].'/crm/v8/'.$module.'/'.$id,null,$session['access_token'],'PUT',['data'=>[$data]]);
        $status=$result['data'][0]['status']??'';
        if ($status!=='success') throw new RuntimeException((string)($result['data'][0]['code']??'update_failed'));
        if($field==='Title'){
            $confirmed=requestZoho($session['api_domain'].'/crm/v8/'.$module.'/'.$id,null,$session['access_token']);
            if((string)($confirmed['data'][0]['Title']??'')!==$value)respond(['error'=>'The saved Title could not be confirmed. Refresh the card to see its current value.'],409);
        }
        respond(['ok'=>true,'field'=>$field,'value'=>$value,'first_name'=>$data['First_Name']??null,'last_name'=>$data['Last_Name']??null]);
    }
    if($action==='relation_search'){
        $type=(string)($_GET['type']??'');$word=trim((string)($_GET['word']??''));
        $target=$type==='Customer'?'Accounts':($type==='Supplier'?'Vendors':(in_array($type,['Warehouse','Broker','Carrier','Forwarder'],true)?'Logistics':''));
        if(!$target||strlen($word)<2||strlen($word)>100)respond(['error'=>'Enter a valid search name.'],400);
        $field=['Accounts'=>'Account_Name','Vendors'=>'Vendor_Name','Logistics'=>'Name'][$target];
        $result=requestZoho($session['api_domain'].'/crm/v8/'.$target.'/search?'.http_build_query(['word'=>$word,'fields'=>'id,'.$field,'per_page'=>50]),null,$session['access_token']);
        $options=[];foreach(($result['data']??[]) as $row)$options[]=['id'=>$row['id'],'name'=>$row[$field]??'Unnamed'];
        respond(['records'=>$options]);
    }
    if ($action === 'create') {
        $input=json_decode((string)file_get_contents('php://input'),true);
        if(!is_array($input)||!in_array($input['module']??'', ['Leads','Contacts'],true))respond(['error'=>'Choose Lead or Contact.'],400);
        $email=strtolower(trim((string)($input['email']??'')));$name=trim((string)($input['name']??''));$mobile=trim((string)($input['mobile']??''));
        $phone=preg_replace('/\D/','',(string)($input['phone']??''));if(strpos($phone,'00')===0)$phone=substr($phone,2);
        if($phone!==''&&!preg_match('/^[0-9]{8,15}$/D',$phone))respond(['error'=>'A valid phone number is required.'],400);
        if(($email!==''||$phone==='')&&(!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($email)>254))respond(['error'=>'A valid email address is required.'],400);
        if($email!==''&&in_array(substr(strrchr($email,'@'),1),['minmaxdeals.com','exporters.sg'],true))respond(['error'=>'Email addresses from this domain are excluded from processing.'],400);
        if($phone!==''){
            $mobileDigits=preg_replace('/\D/','',$mobile);if(strpos($mobileDigits,'00')===0)$mobileDigits=substr($mobileDigits,2);
            if($mobileDigits!==$phone)respond(['error'=>'Mobile must match the WhatsApp number.'],400);
            $mobile='+'.$phone;
        }
        if($name===''||strlen($name)>255||strlen($mobile)>30)respond(['error'=>'Enter a valid name and mobile number.'],400);
        $lastName=$name;$firstName='';
        $options=require __DIR__.'/create-options.php';$type=(string)($input['record_type']??'');$leadStatus=(string)($input['lead_status']??'');
        if(!in_array($type,$options['types'],true))respond(['error'=>'Select a record type.'],400);
        $isContact=$input['module']==='Contacts';
        if(!$isContact&&!in_array($leadStatus,$options['statuses'],true))respond(['error'=>'Select Lead Status.'],400);
        $record=['Last_Name'=>$lastName,($isContact?'Contact_type':'Lead_type')=>$type];
        $title='';
        if($isContact&&in_array($type,['Warehouse','Broker','Carrier','Forwarder'],true)){
            $title=trim((string)($input['title']??''));
            if(strlen($title)>400)respond(['error'=>'Title is too long.'],400);
            if($title!=='')$record['Title']=$title;
        }
        if($isContact)$record['Status']='Active';else $record['Lead_Status']=$leadStatus;
        if($email!=='')$record['Email']=$email;if($mobile!=='')$record['Mobile']=$mobile;
        $target=$type==='Customer'?'Accounts':($type==='Supplier'?'Vendors':($isContact&&in_array($type,['Warehouse','Broker','Carrier','Forwarder'],true)?'Logistics':''));
        $related=null;$logistics=[];
        $relatedId=(string)($input['related_id']??'');
        if($target&&!($target==='Accounts'&&$relatedId==='')){
            if(!preg_match('/^[0-9]{10,25}$/D',$relatedId))respond(['error'=>'Search and select the related CRM record.'],400);
            $detail=requestZoho($session['api_domain'].'/crm/v8/'.$target.'/'.$relatedId,null,$session['access_token']);$row=$detail['data'][0]??null;if(!$row)respond(['error'=>'Related CRM record not found.'],400);
            if($target==='Logistics'){$record['Logistics_Services']=[['Logistics_Services'=>['id'=>$relatedId]]];$logistics=[['Logistics_Services'=>['id'=>$relatedId,'name'=>$row['Name']??'Logistics']]];}
            else{$field=$target==='Accounts'?($isContact?'Account_Name':'Customer_Company'):($isContact?'Vendor_Name':'Supplier_name');$record[$field]=['id'=>$relatedId];$related=['module'=>$target,'id'=>$relatedId,'label'=>$target==='Accounts'?'Account':'Vendor','name'=>$row[$target==='Accounts'?'Account_Name':'Vendor_Name']??''];}
        }
        $ownerId=(string)($input['owner_id']??'');
        if($ownerId==='')respond(['error'=>'Select the CRM owner before creating the record.'],400);
        if($ownerId!==''){
            if(!preg_match('/^[0-9]{10,25}$/D',$ownerId))respond(['error'=>'Select a valid CRM owner.'],400);
            $active=requestZoho($session['api_domain'].'/crm/v8/users?'.http_build_query(['type'=>'ActiveUsers','per_page'=>200]),null,$session['access_token']);$owner=null;
            foreach(($active['users']??[]) as $candidate)if((string)($candidate['id']??'')===$ownerId&&($candidate['status']??'')==='active'){$owner=$candidate;break;}
            if(!$owner)respond(['error'=>'That CRM owner is not active. Refresh the panel and try again.'],400);
            $record['Owner']=['id'=>$ownerId];
        }
        $created=requestZoho($session['api_domain'].'/crm/v8/'.$input['module'],null,$session['access_token'],'POST',['data'=>[$record]]);
        $entry=$created['data'][0]??[];if(($entry['status']??'')!=='success')throw new RuntimeException((string)($entry['code']??'create_failed'));
respond(['ok'=>true,'id'=>(string)($entry['details']['id']??''),'module'=>$input['module'],'email'=>$email,'last_name'=>$lastName,'first_name'=>$firstName,'mobile'=>$mobile,'title'=>$title,'type'=>$type,'lead_status'=>$leadStatus,'related'=>$related,'logistics_services'=>$logistics,'owner_id'=>$ownerId,'owner'=>$ownerId!==''?($owner['full_name']??$owner['name']??''):''],201);
    }
    if ($action !== 'lookup') respond(['error'=>'Unknown action.'], 404);
    $email = strtolower(trim((string)($_GET['email'] ?? '')));
    $phone = preg_replace('/\D/', '', (string)($_GET['phone'] ?? ''));
    if (strpos($phone,'00')===0) $phone=substr($phone,2);
    if ($phone!=='' && !preg_match('/^[0-9]{8,15}$/D',$phone)) respond(['error'=>'A valid phone number is required.'],400);
    if ($phone==='' && (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254)) respond(['error'=>'A valid email address is required.'], 400);
    if ($email!=='' && in_array(substr(strrchr($email, '@'), 1),['minmaxdeals.com','exporters.sg'],true)) respond(['email'=>$email,'records'=>[],'skipped'=>true]);
    // Limit repeated searches without exposing a shared CRM connection.
    if (($session['lookup_window'] ?? 0) < time()-60) { $session['lookup_window'] = time(); $session['lookup_count'] = 0; }
    if (($session['lookup_count'] ?? 0) >= 120) respond(['error'=>'Too many requests. Refresh the panel in a minute.'], 429);
    $session['lookup_count'] = ($session['lookup_count'] ?? 0) + 1;
    $session['last_lookup'] = time(); writePrivate($sessionPath, $session);
    $records = [];
    $nicknameCache=[];$nicknameScopeMissing=false;$nicknameUnavailable=false;
    $readNickname=function($module,$id)use(&$nicknameCache,&$nicknameScopeMissing,&$nicknameUnavailable,$session){
        $key=$module.':'.$id;if(array_key_exists($key,$nicknameCache))return $nicknameCache[$key];
        try{$detail=requestZoho($session['api_domain'].'/crm/v8/'.$module.'/'.rawurlencode((string)$id),null,$session['access_token']);return $nicknameCache[$key]=(string)($detail['data'][0]['Nickname']??'');}
        catch(Throwable $e){if($e->getMessage()==='OAUTH_SCOPE_MISMATCH')$nicknameScopeMissing=true;else $nicknameUnavailable=true;return $nicknameCache[$key]='';}
    };
    foreach (['Contacts','Leads'] as $module) {
        $result = requestZoho($session['api_domain'].'/crm/v8/'.$module.'/search?'.http_build_query(($phone!==''?['phone'=>$phone]:['email'=>$email])+['per_page'=>200]), null, $session['access_token']);
        if (!empty($result['info']['more_records'])) throw new RuntimeException('too_many');
        foreach (($result['data'] ?? []) as $record) {
            // Zoho's email search covers every email field, including custom fields.
            // Check exact scalar values without restricting matches to two field names.
            $exact = false;
            foreach ($record as $field=>$value) {
                if (!is_string($value)) continue;
                if ($phone==='') {if(strtolower(trim($value))===$email)$exact=true;}
                elseif (preg_match('/phone|mobile/i',$field)) {
                    $digits=preg_replace('/\D/','',$value);if(strpos($digits,'00')===0)$digits=substr($digits,2);
                    if($digits===$phone)$exact=true;
                }
            }
            if (!$exact || !empty($record['$converted'])) continue;
            $type = (string)($record[$module === 'Contacts' ? 'Contact_type' : 'Lead_type'] ?? '');
            // Search responses may omit multi-select lookup values. Read the
            // matched provider record to obtain the full Logistics_Services link.
            if(in_array(strtolower(trim($type)),['warehouse','broker','carrier','forwarder'],true)){
                $detail=requestZoho($session['api_domain'].'/crm/v8/'.$module.'/'.rawurlencode((string)$record['id']),null,$session['access_token']);
                $record=array_replace($record,$detail['data'][0]??[]);
            }
            $related = null;
            $account=$record[$module==='Contacts'?'Account_Name':'Customer_Company']??null;
            $vendor=$record[$module==='Contacts'?'Vendor_Name':'Supplier_name']??null;
            if (strcasecmp($type,'Customer') === 0 && !empty($account['id'])) $related = ['module'=>'Accounts','label'=>'Account','id'=>$account['id'],'name'=>$account['name'] ?? 'Account'];
            if (strcasecmp($type,'Supplier') === 0 && !empty($vendor['id'])) $related = ['module'=>'Vendors','label'=>'Vendor','id'=>$vendor['id'],'name'=>$vendor['name'] ?? 'Vendor'];
            $nicknames=[];
            if($related&&$related['module']==='Vendors'){
                $nickname=$readNickname('Vendors',$related['id']);if($nickname!=='')$nicknames[]=$nickname;
            }
            if(in_array(strtolower(trim($type)),['warehouse','broker','carrier','forwarder'],true)){
                foreach(($record['Logistics_Services']??[]) as $provider){
                    $link=$provider['Logistics_Services']??$provider;
                    if(!empty($link['id'])){$nickname=$readNickname('Logistics',$link['id']);if($nickname!=='')$nicknames[]=$nickname;}
                }
            }
            $record['provider_nicknames']=array_values(array_unique($nicknames));
            $recordEmails=[];
            foreach($record as $value)if(is_string($value)&&filter_var(trim($value),FILTER_VALIDATE_EMAIL)!==false)$recordEmails[]=strtolower(trim($value));
        $records[] = ['id'=>$record['id'],'module'=>$module,'last_name'=>$record['Last_Name'] ?? '', 'first_name'=>$record['First_Name'] ?? '', 'mobile'=>$record['Mobile'] ?? '', 'phone'=>$record['Phone'] ?? '', 'email'=>$record['Email'] ?? '', 'type'=>$type,'title'=>$record['Title'] ?? '','lead_status'=>$record['Lead_Status'] ?? '', 'logistics_services'=>$record['Logistics_Services'] ?? null,'nicknames'=>$record['provider_nicknames'],'owner'=>$record['Owner']['name'] ?? '', 'owner_id'=>$record['Owner']['id'] ?? '', 'related'=>$related];
            $records[count($records)-1]['emails']=array_values(array_unique($recordEmails));
        }
    }
    respond(['email'=>$email,'records'=>$records,'nickname_scope_missing'=>$nicknameScopeMissing,'nickname_unavailable'=>$nicknameUnavailable,'crm_base'=>'https://crm.zoho.com/crm/minmaxdeals/tab']);
} catch (Throwable $e) {
    $code = $e->getMessage();
    $messages = [
        'invalid_client'=>'Zoho rejected the Client ID or Client Secret.',
        'invalid_client_secret'=>'Zoho rejected the Client Secret.',
        'invalid_code'=>'The Zoho authorization code expired. Connect again.',
        'invalid_redirect_uri'=>'The Zoho Redirect URI does not match the app settings.',
        'missing_refresh_token'=>'Zoho did not return a refresh token. Connect again.',
        'unexpected_api_domain'=>'Zoho returned an unexpected API region.',
        'storage'=>'The server could not save the Zoho connection.',
        'network'=>'The server could not connect to Zoho.',
        'OAUTH_SCOPE_MISMATCH'=>'Zoho needs the requested CRM permissions. Reconnect and approve the access request.',
        'NO_PERMISSION'=>'Your Zoho user does not have permission for this module.',
    ];
    $safe = array_key_exists($code, $messages) || in_array($code,['reauthorize','INVALID_TOKEN','missing_access_token','response','too_many'],true) || preg_match('/^zoho_http_[0-9]{3}$/D',$code);
    $expired = in_array($code,['reauthorize','INVALID_TOKEN'],true);
    if ($action === 'callback') {
        try { writePrivate($storage.'/last-oauth-error.php',['diagnostic'=>$safe ? $code : 'internal_error','time'=>time()]); } catch (Throwable $ignored) {}
    }
    respond(['error'=>$messages[$code] ?? ($expired ? 'Please reconnect Zoho.' : 'Could not retrieve Zoho data.'), 'diagnostic'=>$safe ? $code : 'internal_error'], $expired ? 401 : 502);
}
