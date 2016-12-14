SensorTag
====

SensorTagからデータを収集&Cumulocityへ自動的にPOSTするためのソースコードです。  
SensorTagの電源ボタンを押すだけで自動的にCumulocityへのデバイス登録、データ送信を行います。

# Description

Node.jsで動かすためのJavascriptプログラムです。  
以下の構成となっています。  
  
 - multi-ti.js : 複数のSensortagを接続し、データポストするスクリプトです。
 - config-sample.js : multi-ti.js を実行するために必要な設定情報を記載するファイルです。実際に使用する際にはconfig.jsにリネームした上で設定値を記載して使ってください。

上記で登録したデバイスを削除するためのスクリプトも準備しました。

- delete.rb : SensortagのシリアルID（externalID）をキーとしてデバイス、デバイスユーザの両方を削除します。
- config-sample.rb : delete.rbを実行するために必要な設定情報を記載するファイルです。実際に使用する際にはconfig.rbにリネームした上で設定値を記載して使ってください。

Raspberry PI 2 Model Bの環境設定についてはWikiを参照してください。

# Release Note

- 2016.11.18: バッテリ残量の読み取りができるようにしました。 ```~/node_modules/sensortag/lib/cc2650.js``` の変更が必要になりますので Other Configuration を確認してください。

# Usage

## tisample.js / multi-ti.js

 `# node multi-ti.js`

## delete.rb

 `$ ruby delete.rb <externalID>`

## Other Configuration

### Raspberry PIのIP設定を変更  

`/etc/dhcpcd.conf.XXX` と `/etc/wpa_supplicant/wpa_supplicant.conf.XXX` を環境に合わせて編集すればOKです。  

- /etc/dhcpcd.conf(固定IPの場合)
 
```
 interface wlan0  
 static ip_address=192.168.XXX.XXX/24  
 static routers=192.168.XXX.XXX  
 static domain_name_servers=192.168.XXX.XXX  
```

- /etc/dhcpcd.conf(DHCPの場合) 

```
 上記の記載はなし
```

- /etc/wpa_supplicant/wpa_supplicant.conf

```
 network={  
 ssid="XXXXXX"  
 psk="XXXXXXXX"  
 key_mgmt=WPA-PSK  
 }
```

### ~/node_modules/sensortag/lib/cc2650.jsの変更（バッテリー読み取り対応）

- 変更前（50行目あたり）

```
NobleDevice.Util.inherits(CC2650SensorTag, NobleDevice);
NobleDevice.Util.mixin(CC2650SensorTag, NobleDevice.DeviceInformationService);
NobleDevice.Util.mixin(CC2650SensorTag, Common);
```

- 変更後（50行目あたり）

```
NobleDevice.Util.inherits(CC2650SensorTag, NobleDevice);
NobleDevice.Util.mixin(CC2650SensorTag, NobleDevice.DeviceInformationService);
NobleDevice.Util.mixin(CC2650SensorTag, Common);
NobleDevice.Util.mixin(CC2650SensorTag, NobleDevice.BatteryService); // <-追加
```

### データ収集周期の変更

22行目（multi-ti.jsの場合）にある pollingInterval の値を変更してください。（単位はmsec。デフォルト10秒周期）

```
var pollingInterval = 10000; //ms | NOTE: Interval for polling in periodic
```

## Author

Akiyuki YOSHINO