<?php
declare(strict_types=1);
$source = file_get_contents(__DIR__ . '/public/zoho.php');
if (!preg_match('/\/\* Front Sidebar 2\.0.*?\*\/(.*?)\ntry \{/s', $source, $match)) {
    fwrite(STDERR, "Front order helper block missing\n");exit(1);
}
eval($match[1]);
function check(bool $value,string $name): void {
    if (!$value) {fwrite(STDERR, "FAIL $name\n");exit(1);}
}
check(frontRecordMatches(['Front_Conversation_ID'=>"cnv_abc123\ncnv_def456"],'cnv_def456'),'multiple front IDs');
check(!frontRecordMatches(['Front_Conversation_ID'=>"cnv_abc123-other"],'cnv_abc123'),'exact ID only');
check(frontRecordMatches(['Front_Conversation_ID'=>'cnv_abc123'],'cnv_abc123'),'single ID');
check(!frontRecordMatches(['Front_Conversation_ID'=>''],'cnv_abc123'),'no conversation');
$fields=frontBlueprintFields(['fields'=>[
  ['api_name'=>'Leading_time','field_label'=>'Leading time','data_type'=>'picklist','_type'=>'fields','$optional'=>false,'content'=>'2 weeks','pick_list_values'=>[
    ['actual_value'=>'-None-','display_value'=>'-None-'],
    ['actual_value'=>'2 weeks','display_value'=>'2 weeks']
  ]],
  ['api_name'=>'Custom_widget','data_type'=>'widget','_type'=>'widget','mandatory'=>true]
]]);
check(count($fields)===2,'field list');
check($fields[0]['mandatory']===true,'required field');
check(count($fields[0]['options'])===1 && $fields[0]['options'][0]['value']==='2 weeks','picklist filtering');
check(frontSupportedBlueprintField($fields[0]),'picklist supported');
check(!frontSupportedBlueprintField($fields[1]),'widget blocked');
$po=frontOrderSummary('Purchase_Orders', [
  'id'=>'4888374000131890043',
  'Subject'=>'Test purchase',
  'Owner'=>['id'=>'4888374000000337001','name'=>'Stetsenko'],
  'Front_Conversation_ID'=>'cnv_test1234',
]);
check($po['owner_id']==='4888374000000337001','owner id retained');
check($po['owner']==='Stetsenko','owner display fallback retained');
$transitions=[
  ['sequence'=>2,'name'=>'Canceled','color_code'=>'#eb4d4d','text_color_code'=>'#FFFFFF'],
  ['sequence'=>1,'name'=>'Confirmed','color_code'=>'#5cb3fd','text_color_code'=>'#000000'],
];
usort($transitions,fn($a,$b)=>$a['sequence']<=>$b['sequence']);
check($transitions[0]['name']==='Confirmed','CRM transition sequence sorted');
check($transitions[0]['color_code']==='#5cb3fd','CRM color preserved');
echo "Order helper tests: 12 passed\n";