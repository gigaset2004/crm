<?php
if (!defined('MINMAX_ZOHO_INTERNAL')) { http_response_code(404); exit; }
return json_decode('{"types":["Unknown","Customer","Supplier","Broker","Forwarder","Carrier","Inspector","Warehouse"],"statuses":["Unknown","Not Contacted","Attempted to Contact","Second attempt to contact","Additional info research","Third attempt to contact","Contacted","Offer received","Inspection / Verification","Contact in Future","Junk Lead","Lost Lead","Scam","No reply"]}',true);
