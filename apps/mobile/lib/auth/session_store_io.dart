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
    await _file().writeAsString(jsonEncode({'token': token, 'user': user.toJson()}));
  }

  Future<String?> readToken() async => (await _read())['token'] as String?;

  Future<AuthUser?> readUser() async {
    final user = (await _read())['user'];
    if (user is Map<String, dynamic>) return AuthUser.fromJson(user);
    return null;
  }

  Future<void> clear() async {
    final file = _file();
    if (file.existsSync()) await file.delete();
  }
}
