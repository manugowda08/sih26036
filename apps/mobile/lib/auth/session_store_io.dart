import 'dart:convert';
import 'dart:io';

import '../api/api_client.dart';

class SessionStore {
  File _file() {
    final home = Platform.environment['APPDATA'] ??
        Platform.environment['HOME'] ??
        Directory.systemTemp.path;
    final dir = Directory('$home${Platform.pathSeparator}lm_smart');
    if (!dir.existsSync()) {
      dir.createSync(recursive: true);
    }
    return File('${dir.path}${Platform.pathSeparator}session.json');
  }

  Future<Map<String, dynamic>> _read() async {
    final file = _file();
    if (!file.existsSync()) return {};
    return jsonDecode(await file.readAsString()) as Map<String, dynamic>;
  }

  Future<void> save({required String token, required AuthUser user}) async {
    final existing = await _read();
    existing['token'] = token;
    existing['user'] = user.toJson();
    await _file().writeAsString(jsonEncode(existing));
  }

  Future<void> saveApiBaseUrl(String url) async {
    final existing = await _read();
    existing['apiBaseUrl'] = url;
    await _file().writeAsString(jsonEncode(existing));
  }

  Future<String?> readToken() async => (await _read())['token'] as String?;

  Future<String?> readApiBaseUrl() async => (await _read())['apiBaseUrl'] as String?;

  Future<AuthUser?> readUser() async {
    final user = (await _read())['user'];
    if (user is Map<String, dynamic>) return AuthUser.fromJson(user);
    return null;
  }

  Future<void> clear() async {
    final existing = await _read();
    existing.remove('token');
    existing.remove('user');
    if (existing.isEmpty) {
      final file = _file();
      if (file.existsSync()) await file.delete();
    } else {
      await _file().writeAsString(jsonEncode(existing));
    }
  }
}
