<?php
declare(strict_types=1);
$case=getenv('TEST_CASE')?:'lead-empty';
$type=str_contains($case,'supplier')?'Supplier':($case==='logistics-empty'?'Warehouse':'Customer');$isContact=in_array($case,['contact-empty','contact-selected','contact-supplier-empty','contact-invalid-id','logistics-empty'],true);
$input=['related_id'=>str_ends_with($case,'selected')?'1234567890100':(str_contains($case,'invalid-id')?'invalid':'')];
$session=['api_domain'=>'https://fixture.invalid','access_token'=>'not-a-token'];$record=[];$calls=0;
function requestZoho(string $url,?array $form=null,?string $token=null):array{global $calls;$calls++;return ['data'=>[['id'=>'1234567890100','Account_Name'=>'Demo Company']]];}
function respond(array $data,int $status=200):void{global $case,$calls;if(!in_array($case,['supplier-empty','contact-supplier-empty','invalid-id','contact-invalid-id','logistics-empty'],true)||$status!==400||$calls!==0)throw new Exception('unexpected validation');echo $case." passed\n";exit;}
require __DIR__.'/create-relation-handler.php';
if(in_array($case,['lead-empty','contact-empty'],true)){if($calls!==0||$record!==[]||$related!==null)throw new Exception('Account was not optional');}
elseif(in_array($case,['lead-selected','contact-selected'],true)){if($calls!==1||($record[$isContact?'Account_Name':'Customer_Company']['id']??'')!=='1234567890100')throw new Exception('selected Account not retained');}
else throw new Exception('required relation accepted');
echo $case." passed\n";
