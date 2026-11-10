<?php
declare(strict_types=1);
// Run with the extracted, unchanged relation_update handler; no real API calls.
$case=getenv('TEST_CASE')?:'account';$writes=[];
$provider=$case==='provider';$lead=$case==='lead-vendor';
$module=$lead?'Leads':'Contacts';$type=$provider?'Broker':($case==='vendor'||$lead?'Supplier':'Customer');
$field=$provider?'Logistics_Services':($type==='Customer'?'Account_Name':($lead?'Supplier_name':'Vendor_Name'));
$current=['id'=>'1234567890100',($lead?'Lead_type':'Contact_type')=>$type,'Modified_Time'=>'2026-10-15T10:00:00+00:00'];
$current[$field]=$provider?[['id'=>'1234567890700','Logistics_Services'=>['id'=>'1234567890300','name'=>'Previous']]]:['id'=>'1234567890300','name'=>'Previous'];
$input=['module'=>$module,'id'=>$current['id'],'related_ids'=>['1234567890200'],'expected_ids'=>[$case==='conflict'?'1234567890999':'1234567890300']];
if($case==='lead-provider'){$module='Leads';$input['module']='Leads';$current['Lead_type']='Broker';}
$_SERVER['REQUEST_METHOD']='POST';$action='relation_update';$session=['api_domain'=>'https://fixture.invalid','access_token'=>'not-a-token'];
function requestZoho(string $url,?array $form=null,?string $token=null,string $method='GET',?array $json=null,array $headers=[]):array{
 global $current,$field,$provider,$writes;
 if($method==='PUT'){
  if($headers!==['If-Unmodified-Since: 2026-10-15T10:00:00+00:00'])throw new Exception('missing concurrency guard');
  $data=$json['data'][0];if(array_keys($data)!==[$field])throw new Exception('unexpected field write');$writes[]=$data;
  if($provider){
   if($data[$field]!==[['id'=>'1234567890700','_delete'=>null],['Logistics_Services'=>['id'=>'1234567890200']]])throw new Exception('incorrect provider diff');
   $current[$field]=[['id'=>'1234567890701','Logistics_Services'=>['id'=>'1234567890200','name'=>'Chosen']]];
  }else{$current[$field]=$data[$field];}
  return ['data'=>[['status'=>'success']]];
 }
 if(str_ends_with($url,'/1234567890100'))return ['data'=>[$current]];
 return ['data'=>[['id'=>'1234567890200','Name'=>'Chosen','Account_Name'=>'Chosen','Vendor_Name'=>'Chosen','Nickname'=>'TEST']]];
}
function respond(array $data,int $status=200):void{
 global $case,$writes;
 if($case==='conflict'||$case==='lead-provider'){
  if($status!==($case==='conflict'?409:400)||count($writes)!==0)throw new Exception('unsafe write');
 }else{
  if($status!==200||empty($data['ok'])||count($writes)!==1)throw new Exception('save not confirmed');
 }
 echo $case." passed\n";exit;
}
require __DIR__.'/relation-handler.php';
throw new Exception('handler did not respond');
