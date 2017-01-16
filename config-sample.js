exports.id = '<Your Cumulocity ID>';
exports.password = '<Your Cumulocity Password>';
exports.devicepassword = '<Your Device Password (Any)>';
exports.tenant = '<Your Cumulocity Tenant Name>';
exports.group = '<Your Group Name>';
// delete = true : デバイス切断時にCumulocity上でのデバイス登録を削除する
// delete = false: デバイス切断時にCumulocity上でのデバイス登録を削除しない
exports.delete = true;
// データ収集周期設定（単位はms）
exports.pollingInterval = 10000;
// 何回データを収集したらPOSTするか（単位は回）
exports.repetationNumber = 1;