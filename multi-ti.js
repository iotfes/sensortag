/*
* multi-ti.js 
* Author: a-yoshino
* Last Update: 2017/1/16
* Usage: node multi-ti.js
*/
var async = require('async');
var SensorTag = require("sensortag");
var request = require('request');
var moment = require('moment');
var fs = require('fs');
var EOL = require('os').EOL;

var config = require('./config.js');

var userID = config.id;
var userPW = config.password;
var devicePW = config.devicepassword;
var tenant = config.tenant;
var group = config.group;
var deleteFlg = config.delete;

var pollingInterval = config.pollingInterval || 10000; // ms | Interval for polling in periodic
var repetationNumber = config.repetationNumber || 1; // a number for deciding how many measurement data to be sent together

var baseURI = 'http://'+tenant+'.cumulocity.com';
var inventoryURI = '/inventory/managedObjects';
var measurementURI = '/measurement/measurements';
var getExtIDURITemplate = '/identity/externalIds/c8y_Serial/<ID>';
var deviceCredentialsURI = '/devicecontrol/bulkNewDeviceRequests ';
var deleteUserURI = '/user/'+tenant+'/users/<ID>';

var deviceUserFixedStr = 'device_'

var SINGLEHEADER = 'application/vnd.com.nsn.cumulocity.measurement+json';
var MULTIPLEHEADER = 'application/vnd.com.nsn.cumulocity.measurementCollection+json';

var Base64 = {
  encode: function(str) {
    var buffer;
    if (Buffer.isBuffer(str)) {
      buffer = str;
    }
    else {
      buffer = new Buffer(str.toString(), 'binary');
    }

    return buffer.toString('base64');
  },
  decode: function(str) {
    return new Buffer(str, 'base64').toString('binary');
  }
};

function makeBody(results, deviceName, deviceID){
  var body = {};
  var signals = {};
  body.time = moment().toISOString();
  body.source = {"id": deviceID};
  body.type = deviceName;

  body.irTemperature = results[0];
  body.accelerometer = results[1];
  body.humidity = results[2];
  body.magnetometer = results[3];
  body.barometricPressure = results[4];
  body.gyroscope = results[5];
  body.luxometer = results[6];
  body.battery = results[7];
  
  return body;
}

function addFigure(str) {
    var prestr = new String(str).replace(/:/g, "");
    var num = prestr.substr(0, 6) + '0000' + prestr.substr(6)
    return num;
}

var deviceTimers = {}; // Storage for setinterval objects
var measurementTimes = {}; // Storage for repetation numbers 
var measurementArrays = {}; // Storage for measurement data

var onDiscover = function(sensorTag) {
  sensorTag.once('disconnect', function() {
    clearTimeout(deviceTimers[sensorTag.id]);
    delete(deviceTimers[sensorTag.id]);
    console.info(sensorTag.id, 'disconnected');
  });

  async.series({
    connectAndSetUp: function(next) {
      console.info(sensorTag.id, 'discovered');
      sensorTag.connectAndSetUp(function() {
        SensorTag.discover(onDiscover); // NOTE: resume for discover other devices
        next();
      });
    },
    enableSensors: function(next) {
      sensorTag.enableIrTemperature();
      sensorTag.enableAccelerometer();
      sensorTag.enableHumidity();
      sensorTag.enableMagnetometer();
      sensorTag.enableBarometricPressure();
      sensorTag.enableGyroscope();      
      sensorTag.notifySimpleKey();
      try {
        sensorTag.enableLuxometer();
      } catch(ex) {
        // NOTE: Ignored because not supported
      }
      console.info(sensorTag.id, 'ready');
      next();
    },
  }, function() {
    // NOTE: In case of polling in periodic
    async.waterfall([
      function(callback) {
      // 1. デバイス名取得
      deviceName = null;
      console.log('readDeviceName');
      sensorTag.readDeviceName(function(error, deviceName) {
        console.log('device name = ' + deviceName);
        callback(null, deviceName);
        }); // sensorTag.readDeviceName
      }, // async.waterfall.1
      function(deviceName, callback) {
        // 2. システムID（externalID）取得
        systemID = null;

        console.log('readSystemId');
        systemID = addFigure(sensorTag.id);
        console.log('system id = ' + systemID);

        callback(null, deviceName, systemID);

      }, // async.waterfall.2
      function(deviceName, systemID, callback) {
        // 3. デバイス初期登録確認

        // API送信用データ準備
        var options = {
          uri: baseURI + getExtIDURITemplate.replace(/<ID>/g, systemID),
          headers: {
            'Authorization': 'Basic ' + Base64.encode(userID + ":" + userPW)
          },
          json: true
        };

        console.log(options);

        // API叩く
        request.get(options, function(error, response, body){

          if (!error && response.statusCode == 200) {
          // 3-1. デバイスがすでに存在している場合
            console.log(body);
            console.info("[INFO] Device is already registered.");
            deviceID = body.managedObject.id;
            console.info("[INFO] Device ID: " + deviceID);
            callback(null, deviceName, systemID, deviceID);

          } else if (!error && response.statusCode == 404){ // request.get後のstatus code判定部
          // 3-2. デバイス初期登録フロー開始
            console.log(body.error);
            console.log(body.message);
            console.info("[INFO] Device is not registered...");
            console.info("[INFO] Device registration start.");

          // 3-2-1. デバイスの登録処理
          // センサのシリアルIDをExternal IDとしてBulk方式で登録する
            var csvData = new String();
            csvData += 'ID;CREDENTIALS;TYPE;NAME;ICCID;IDTYPE;PATH;SHELL'+EOL;
            csvData += systemID + ';' + devicePW + ';' + deviceName + ';' + deviceName + '/' + systemID + ';;;' + group + ';0'

            var formData = {
              file: {
                value: csvData,
                options: {
                  contentType: 'plain/text'
                }  
              }                              
            };

            var options = {
              uri: baseURI + deviceCredentialsURI,
              headers: {
                'Authorization': 'Basic ' + Base64.encode(userID + ":" + userPW),
                'Accept': 'application/json'
              },
              formData: formData
            };

            // API叩く
            request.post(options, function(error, response, body){
              console.log(body);

              // できたら
              if (!error && response.statusCode == 201) {

                // ここからglobalID問い合わせ
                // API送信用データ準備
                var options = {
                  uri: baseURI + getExtIDURITemplate.replace(/<ID>/g, systemID),
                  headers: {
                    'Authorization': 'Basic ' + Base64.encode(deviceUserFixedStr + systemID + ":" + devicePW)
                  },
                  json: true
                };

                console.log(options);

                // API叩く
                request.get(options, function(error, response, body){

                  if (!error && response.statusCode == 200) {
                    // 3-2-1. globalIDが正常に取得した場合
                    console.log(body);
                    deviceID = body.managedObject.id;
                    console.info('[INFO] Device "' + systemID + '" has registered successfully.');
                    console.info('[INFO] Device ID is : ' + deviceID);
                    callback(null, deviceName, systemID, deviceID);
                  } else {
                    // 3-2-2. globalID取得が失敗した場合
                    console.error('[ERR] HTTP ResponseCode: '+ response.statusCode);
                    console.error('[ERR] Exit.');
                    process.exit();                             
                  }
                }); 
                // ここまでglobalID問い合わせ

              } else {
                console.error('[ERR] HTTP ResponseCode: '+ response.statusCode);
                console.error('[ERR] Exit.');
                process.exit();
              }
            });

          } else { // request.get後のstatus code判定部
            // 3-3. 問い合わせ失敗
            console.error('[ERR] Device Existing Confirmation failed.');
            console.error('[ERR] HTTP ResponseCode: '+ response.statusCode);
            console.error('[ERR] Exit.');
            process.exit();

          } // request.get後のstatus code 判定部

        }); // request.get (for 3)

      } // async.waterfall.3
      ],function(err, deviceName, systemID, deviceID) {
        // deviceName: デバイス（センサ）の名前(SensorTag 2.0)
        // systemID: external IDのこと。
        // deviceID: global IDのこと。

        // データPOSTのためのカウンタ
        measurementTimes[sensorTag.id] = 0;
        // measurementの格納変数
        measurementArrays[sensorTag.id] = [];

        function dataCollectLoop() {

          console.log("dataCollectionLoop: measurementTimes=" + measurementTimes[sensorTag.id]);

          async.series([

            function(callback) {
              console.log('readIrTemperature');
              sensorTag.readIrTemperature(function(error, objectTemperature, ambientTemperature) {
                console.log('object temperature = %d °C', objectTemperature.toFixed(1));
                console.log('ambient temperature = %d °C', ambientTemperature.toFixed(1));

                var obj = Object();
                var objTemp = Object();
                var ambTemp = Object();

                objTemp['value'] = objectTemperature.toFixed(1);
                objTemp['unit'] = "°C"; 

                ambTemp['value'] = ambientTemperature.toFixed(1);
                ambTemp['unit'] = "°C"; 

                obj['objectTemperature'] = objTemp; 
                obj['ambientTemperature'] = ambTemp; 

                callback(null, obj);
              });
            },
            function(callback) {
              console.log('readAccelerometer');
              sensorTag.readAccelerometer(function(error, x, y, z) {
                console.log('x = %d G', x.toFixed(1));
                console.log('y = %d G', y.toFixed(1));
                console.log('z = %d G', z.toFixed(1));

                var obj = Object();
                var objX = Object();
                var objY = Object();
                var objZ = Object();

                objX['value'] = x;
                objX['unit'] = "G";
                objY['value'] = y;
                objY['unit'] = "G";
                objZ['value'] = z;
                objZ['unit'] = "G";

                obj['acc_x'] = objX;
                obj['acc_y'] = objY;
                obj['acc_z'] = objZ;

                callback(null, obj);
              });
            },
            function(callback) {
              console.log('readHumidity');
              sensorTag.readHumidity(function(error, temperature, humidity) {
                console.log('temperature = %d °C', temperature.toFixed(1));
                console.log('humidity = %d %', humidity.toFixed(1));

                var obj = Object();
                var objTemp = Object();
                var objHumid = Object();

                objTemp['value'] = temperature.toFixed(1);
                objTemp['unit'] = "°C";
                objHumid['value'] = humidity.toFixed(1);
                objHumid['unit'] = "%";

                obj['temperature'] = objTemp;
                obj['humidity'] = objHumid;

                callback(null, obj);
              });
            },
            function(callback) {
              console.log('readMagnetometer');
              sensorTag.readMagnetometer(function(error, x, y, z) {
                console.log('x = %d μT', x.toFixed(1));
                console.log('y = %d μT', y.toFixed(1));
                console.log('z = %d μT', z.toFixed(1));

                var obj = Object();
                var objX = Object();
                var objY = Object();
                var objZ = Object();

                objX['value'] = x;
                objX['unit'] = "μT";
                objY['value'] = y;
                objY['unit'] = "μT";
                objZ['value'] = z;
                objZ['unit'] = "μT";

                obj['mag_x'] = objX;
                obj['mag_y'] = objY;
                obj['mag_z'] = objZ;

                callback(null, obj);
              });
            },
            function(callback) {
              console.log('readBarometricPressure');
              sensorTag.readBarometricPressure(function(error, pressure) {
                console.log('pressure = %d mBar', pressure.toFixed(1));

                var obj = Object();
                var objPress = Object();

                objPress['value'] = pressure.toFixed(1);
                objPress['unit'] = "mBar";

                obj['pressure'] = objPress;

                callback(null, obj);
              });
            },
            function(callback) {
              console.log('readGyroscope');
              sensorTag.readGyroscope(function(error, x, y, z) {
                console.log('x = %d °/s', x.toFixed(1));
                console.log('y = %d °/s', y.toFixed(1));
                console.log('z = %d °/s', z.toFixed(1));

                var obj = Object();
                var objX = Object();
                var objY = Object();
                var objZ = Object();

                objX['value'] = x;
                objX['unit'] = "°/s";
                objY['value'] = y;
                objY['unit'] = "°/s";
                objZ['value'] = z;
                objZ['unit'] = "°/s";

                obj['gyro_x'] = objX;
                obj['gyro_y'] = objY;
                obj['gyro_z'] = objZ;

                callback(null, obj);
              });
            },
            function(callback) {
              console.log('readLuxometer');
              sensorTag.readLuxometer(function(error, lux) {
                console.log('lux = %d', lux.toFixed(1));

                var obj = Object();
                var objLux = Object();

                objLux['value'] = lux.toFixed(1);
                objLux['unit'] = "lx";

                obj['Luxometer'] = objLux;

                callback(null, obj);
              });
            },
            function readBattery(callback) {
              console.log('readBattery');
              sensorTag.readBatteryLevel(function(error, battery) {
                console.log('Battery : %d', battery.toFixed(1));

                var obj = Object();
                var objBattery = Object();

                objBattery['value'] = battery.toFixed(1);
                objBattery['unit'] = "%";

                obj['Battery'] = objBattery;

                callback(null, obj);
              });
            }
            ],
            function results(err, results) {
              console.log('results: measurementTimes=' + measurementTimes[sensorTag.id]);

              var measurement = makeBody(results, deviceName, deviceID);

              // 測定値を配列に追加
              measurementArrays[sensorTag.id].push(measurement);

              // カウンタをアップ
              measurementTimes[sensorTag.id]++;

              // カウンタが規定値を超えていたらPOSTするやつを呼び出し
              postData: // label
              if(measurementTimes[sensorTag.id] >= repetationNumber) {

                // POSTのbody
                var body = {};

                // Measurementが単数か複数かでHTTP Headerの値を変える必要があるため、変数としてセット
                var contentType = "";
                var accept = "";

                // 処理が詰まると嫌なので最初にカウンタリセット
                measurementTimes[sensorTag.id] = 0;

                console.log("measurementArrays["+sensorTag.id+"]=>");
                console.log(measurementArrays[sensorTag.id]);

                // measurementsArrayに入っている要素が1つならbodyそのまま、2つ以上なら"measurements":[]の形にしてあげる処理がいる
                if(measurementArrays[sensorTag.id].length > 1){
                  contentType = MULTIPLEHEADER;
                  accept = MULTIPLEHEADER;
                  body = {"measurements" : measurementArrays[sensorTag.id]};
                } else if (measurementArrays[sensorTag.id].length === 1) {
                  contentType = SINGLEHEADER;
                  accept = SINGLEHEADER;
                  body = measurementArrays[sensorTag.id][0];
                } else {
                  console.error('[ERR] No measurement data for ' + sensorTag.id);
                  measurementArrays[sensorTag.id] = [];
                  break postData; // POSTを止める.Alarmあげてもいいかもね
                }

                // for debug
                console.log("body["+sensorTag.id+"]=>");
                console.log(JSON.stringify(body));

                // API送信用データ
                var options = {
                  uri: baseURI + measurementURI,
                  headers: {
                    'Authorization': 'Basic ' + Base64.encode(deviceUserFixedStr + systemID + ":" + devicePW),
                    'Content-Type': contentType,
                    'Accept': accept
                  },
                  body: JSON.stringify(body)
                };

                // API叩く
                request.post(options, function(error, response, body){
                  if (!error && response.statusCode == 201) {
                    console.log("POST response body=>");
                    console.log(body);
                  } else {
                    JSON.parse(response);
                    console.error('error: '+ response.statusCode);
                    console.error(response.body);
                  }
                });

                // POSTしたのでmeasurementデータをクリア
                measurementArrays[sensorTag.id] = [];

              } // if(measurementTimes > repetationNumber) 


            }); // async.series

            setTimeout(dataCollectLoop, pollingInterval);

          } // function dataCollectLoop()

          deviceTimers[sensorTag.id] = setTimeout(dataCollectLoop, pollingInterval);

        }); // async.waterfall.end



      // NOTE: In case of listening for notification
      sensorTag.on('simpleKeyChange', function(left, right) {
        var data = {Info: {id: sensorTag.id}, SimpleKey: {left: left, right: right}};
        if (left) {
          console.log(JSON.stringify(data));
          console.log(addFigure(sensorTag.id) + ' を切断します。');
          sensorTag.disconnect();
          clearTimeout(deviceTimers[sensorTag.id]);
          delete(deviceTimers[sensorTag.id]);

          // deleteフラグがtrueならc8y上のデバイス情報を削除
          if (deleteFlg) {

            // Device Deletion Process
            var externalID =  addFigure(sensorTag.id);
          
            async.waterfall([
              function(callback) {
                // 1. globalIDの確認

                // globalID
                var deviceID = null;

                // API送信用データ準備
                var options = {
                  uri: baseURI + getExtIDURITemplate.replace(/<ID>/g, externalID),
                  headers: {
                    'Authorization': 'Basic ' + Base64.encode(userID + ":" + userPW)
                  },
                  json: true
                };

                console.log(options);

                // API叩く
                request.get(options, function(error, response, body){

                  if (!error && response.statusCode == 200) {
                    // 1-1. デバイスがすでに存在している場合（普通あるはず）
                    console.log(body);
                    deviceID = body.managedObject.id;
                    console.info("[INFO] Device ID: " + deviceID);
                    callback(null, deviceID);
                  } else { 
                    // 1-2. 問い合わせ失敗
                    console.error('[ERR] Device Existing Confirmation failed.');
                    console.error('[ERR] HTTP ResponseCode: '+ response.statusCode);
                    console.error('[ERR] Exit.');
                    process.exit();
                  } // request.get後のstatus code 判定部

                }); // request.get (for 1)

              },
              function(deviceID, callback) {
                // 2. デバイスの削除

                console.log(deviceID);
                // API送信用データ準備
                var options = {
                  uri: baseURI + inventoryURI + '/' + deviceID,
                  headers: {
                    'Authorization': 'Basic ' + Base64.encode(userID + ":" + userPW)
                  },
                  json: true
                };                

                console.log(options);

                // API叩く
                request.delete(options, function(error, response, body){

                  if (!error && response.statusCode == 204) {
                    // 2-1. 正常にデバイス削除した場合
                    console.info("[INFO] Device ID: " + deviceID + ' has successfully deleted.');
                    callback(null, deviceID);
                  } else { 
                    // 2-2. 問い合わせ失敗
                    console.error('[ERR] Device Deletion failed.');
                    console.error('[ERR] HTTP ResponseCode: '+ response.statusCode);
                    console.error('[ERR] Exit.');
                    process.exit();
                  } // request.get後のstatus code 判定部

                }); // request.get (for 2)

              },
              function(deviceID, callback) {
                // 3. デバイスユーザの削除

                // API送信用データ準備
                var options = {
                  uri: baseURI + deleteUserURI.replace(/<ID>/g, deviceUserFixedStr+externalID),
                  headers: {
                    'Authorization': 'Basic ' + Base64.encode(userID + ":" + userPW)
                  },
                  json: true
                };                

                console.log(options);

                // API叩く
                request.delete(options, function(error, response, body){

                  if (!error && response.statusCode == 204) {
                    // 3-1. 正常にデバイスユーザ削除した場合
                    console.info('[INFO] Device user: ' + deviceUserFixedStr + externalID + ' has successfully deleted.');
                    callback(null, deviceID);
                  } else { 
                    // 3-2. 問い合わせ失敗
                    console.error('[ERR] Device Deletion failed.');
                    console.error('[ERR] HTTP ResponseCode: '+ response.statusCode);
                    console.error('[ERR] Exit.');
                    process.exit();
                  } // request.get後のstatus code 判定部

                }); // request.get (for 3)

              }
            ], function(err, results){
              console.info('[INFO] All deletion process has successfully completed.');
            }); // async.waterfall

          } // if(deleteFlg)


        }
      });
    });
};

console.info('start');
SensorTag.discover(onDiscover);
