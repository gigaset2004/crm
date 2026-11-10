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
echo "Order helper tests: 8 passed\n";