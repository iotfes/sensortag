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

- 2017.1.16: SensorTagのデータを複数個まとめてPOSTできるように変更しました。 ```config-sample.js``` に設定パラメータを追加していますのでご確認ください。  
- 2016.11.18: バッテリ残量の読み取りができるようにしました。 ```~/node_modules/sensortag/lib/cc2650.js``` の変更が必要になりますので Other Configuration を確認してください。

# Usage

## multi-ti.js

 `# node multi-ti.js`

## delete.rb

 `$ ruby delete.rb <externalID>`

## Other Configuration

### SensorTagのデータを複数個まとめてPOSTのしくみ

![measurement](https://raw.github.com/wiki/iotfes/sensortag/img/measurement.jpg "measurement")

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

### サービス自動起動設定

Raspberry PIの電源ON時に自動的にmulti-ti.jsを動かすためのTIPS。  
[参考：Raspbian jessieでSystemdを使った自動起動](http://qiita.com/yosi-q/items/55d6d3d6834c778ae2ea)

1.serviceファイルの作成

下記のような「sensortag.service」ファイルを/etc/systemd/system配下におきます。  
（以下、sensortagディレクトリが/home/pi直下にある場合。ディレクトリが変わる場合はExecStartの項を適宜編集。）

`$ sudo vim /etc/systemd/system/sensortag.service`

```
[Unit]
Description=sensortag service
After=syslog.target network.target

[Service]
ExecStart=/usr/local/bin/node /home/pi/sensortag/multi-ti.js
Restart=always
RestartSec=10                       # Restart service after 10 seconds if node service crash$
StandardOutput=syslog               # Output to syslog
StandardError=syslog                # Output to syslog
SyslogIdentifier=nodejs-ti
User=root
Group=root

[Install]
WantedBy=multi-user.target
```

2.登録確認

以下のコマンドを打って、同じ結果が返ってきていれば成功

```
$ sudo systemctl list-unit-files --type=service |grep sensortag
sensortag.service                      disabled
```

```
$ sudo systemctl start sensortag
（何も表示されない）
$ ps aux |grep node
root      1353 63.0  3.1  92368 30308 ?        Ssl  12:10   0:02 /usr/local/bin/node /home/pi/sensortag/multi-ti.js
$ sudo systemctl stop sensortag
（何も表示されない）
```

3.自動起動設定

```
$ sudo systemctl enable sensortag
Created symlink from /etc/systemd/system/multi-user.target.wants/sensortag.service to /etc/systemd/system/sensortag.service.
```

## Author

Akiyuki YOSHINO