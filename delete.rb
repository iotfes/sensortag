#!/bin/ruby

require 'json'
require 'open-uri'
require 'uri'
require 'base64'
require 'addressable/uri'
require 'net/http'
require 'logger'

# ログレベル設定(デフォルト：WARN)
log = Logger.new(STDOUT)
log.level = Logger::DEBUG

## Config.rb存在チェック
if File.exist?('config.rb') then
	config = eval File.read 'config.rb'
else
	log.error('Configuration file missing... Plz confirm config.rb file exists.')
	exit(1)
end

domain = 'http://'+config[:tenant]+'.cumulocity.com'
getPath = '/identity/externalIds/c8y_Serial/'
deleteObjPath = '/inventory/managedObjects/'
deleteUserPath = '/user/'+config[:tenant]+'/users/'

externalID = nil
globalID = nil
deviceUserFixedStr = 'device_'

## 引数存在チェック
unless ARGV[0] == nil
	externalID = ARGV[0]
else
	log.error("No Argument Error. Exit.")
	exit(1)
end


# リクエスト時のBasic認証
auth = 'Basic ' + Base64.encode64(config[:id]+":"+config[:password]).strip!

## ExternalIDからGlobalIDを問い合わせ

# URL
geturl = domain + getPath + externalID
uri = Addressable::URI.parse(geturl)

# GETリクエスト生成
req = Net::HTTP::Get.new(uri.request_uri)

# カスタムヘッダはHTTP::Getオブジェクトのハッシュとして指定
req['Content-Type'] = 'application/json;'
req['Authorization'] = auth

# リクエスト実行
response = Net::HTTP.start(uri.host, uri.port) do |http|
  http.request(req)
end

log.debug(response.code + ": " + response.message)
log.debug(response.body)

# globalIDを引っこ抜く
if response.code.to_i == 200 then
	globalID = JSON.parse(response.body)['managedObject']['id']
	log.debug('globalID: ' + globalID)
else
	log.error('Cannot get globalID... Exit.' )
	exit(1)
end

# DELETE確認
p "Device " + globalID + "(" + externalID + ") will be deleted. Are you sure?(Y/n)"
key = STDIN.getc.chomp!

if key == "Y" || key == "y" || key.empty? then
	p "delete start."

	## GlobalIDを使ってオブジェクト削除
	#url
	delurl = domain + deleteObjPath + globalID
	uri = Addressable::URI.parse(delurl)

	req = Net::HTTP::Delete.new(uri.request_uri)
	req['Authorization'] = auth
	response = Net::HTTP.start(uri.host, uri.port) do |http|
	  http.request(req)
	end

	log.debug(response.code + ": " + response.message)
	log.debug(response.body)

	if response.code.to_i == 204 then
		globalID = JSON.parse(response.body)['managedObject']['id']
		log.debug('Device ' + globalID + '(' + externalID + ') has deleted. ')
	else
		log.error('Cannot delete device ' + globalID + '(' + externalID + '... Exit.' )
		exit(1)
	end

	## UserNameを使ってオブジェクト削除
	#url
	delurl = domain + deleteUserPath + deviceUserFixedStr + externalID
	uri = Addressable::URI.parse(delurl)

	req = Net::HTTP::Delete.new(uri.request_uri)
	req['Authorization'] = auth
	response = Net::HTTP.start(uri.host, uri.port) do |http|
	  http.request(req)
	end

	log.debug(response.code + ": " + response.message)
	log.debug(response.body)

	if response.code.to_i == 204 then
		globalID = JSON.parse(response.body)['managedObject']['id']
		log.debug('Device user ' + deviceUserFixedStr + externalID + ' has deleted. ')
	else
		log.error('Cannot delete device user ' + deviceUserFixedStr + externalID + '... Exit.' )
		exit(1)
	end

	p 'Device deletion process has completed.'

else
	p "Deletion aborted. exit."
	log.debug('User stops deletion process.')
	exit(1)
end