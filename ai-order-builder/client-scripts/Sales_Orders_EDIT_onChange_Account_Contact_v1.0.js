/* Sales Orders | Standard Edit Page | Page Event onChange
 * Reapply Account Billing and Shipping after Account or Contact changes.
 * The matching onSave script is the final enforcement layer.
 * v1.0.
 */
function crmAccountAddressOnly() {
    var linked=ZDK.Page.getField("Account_Name");
    if(!linked||typeof linked.getValue!=="function"){
        throw new Error("Account lookup field is not available on this Sales Order.");
    }
    var account=linked.getValue();
    if(!account||!account.id){
        throw new Error("Select a Customer Company Name (Account) before saving.");
    }
    // Only Accounts; NEVER read any Contacts address data.
    // Zoho officially recommends this ZDK method for Sales Order addresses.
    var info=ZDK.Apps.CRM.Accounts.fetchById(String(account.id));
    if(!info||!info.id&&!info.Account_Name){
        throw new Error("Could not read the selected CRM Account address.");
    }
    var scopes=["Billing","Shipping"],parts=["Street","City","State","Code","Country"];
    for(var s=0;s<scopes.length;s++){
        for(var p=0;p<parts.length;p++){
            var apiName=scopes[s]+"_"+parts[p],target=ZDK.Page.getField(apiName);
            if(!target||typeof target.setValue!=="function"){
                throw new Error("Sales Order field '"+apiName+"' is not editable on this layout.");
            }
            // Empty Account fields CLEAR Contact-populated values. No fallback.
            var value=info[apiName]==null?"":String(info[apiName]).trim();
            target.setValue(value);
        }
    }
    return true;
}
if(field_name==="Account_Name"||field_name==="Contact_Name"){
    var hasAccount=ZDK.Page.getField("Account_Name");
    var selectedAccount=hasAccount&&hasAccount.getValue();
    if(selectedAccount&&selectedAccount.id){
        try{crmAccountAddressOnly();}
        catch(addressError){
            ZDK.Client.showMessage("Could not apply Account address: "+String(addressError&&addressError.message||addressError),{type:"error"});
        }
    }
}