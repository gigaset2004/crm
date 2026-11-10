<?php
declare(strict_types=1);
$case=getenv('TEST_CASE')?:'title';$writes=[];
$value=$case==='clear'?'':($case==='too-long'?str_repeat('x',101):'Purchasing Director');
$input=['module'=>$case==='lead'?'Leads':'Contacts','id'=>'1234567890100','field'=>$case==='forbidden'?'Password':'Title','value'=>$value];
$action='update';$session=['api_domain'=>'https://fixture.invalid','access_token'=>'not-a-token'];
function requestZoho(string $url,?array $form=null,?string $token=null,string $method='GET',?array $json=null):array{
 global $writes,$value;
 if($method==='PUT'){$data=$json['data'][0];if($data!==['Title'=>$value])throw new Exception('unexpected write');$writes[]=$data;return ['data'=>[['status'=>'success']]];}
 return ['data'=>[['Title'=>$value]]];
}
function respond(array $data,int $status=200):void{
 global $case,$writes,$value;
 $invalid=in_array($case,['too-long','forbidden'],true);
 if($status!==($invalid?400:200)||count($writes)!==($invalid?0:1))throw new Exception('incorrect result');
 if(!$invalid&&($data['field']!=='Title'||$data['value']!==$value))throw new Exception('incorrect response');
 echo $case." passed\n";exit;
}
require __DIR__.'/title-handler.php';
throw new Exception('handler did not respond');
