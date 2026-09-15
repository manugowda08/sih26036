import 'dart:convert';

import 'package:web/web.dart' as web;

import '../api/api_client.dart';

class SessionStore {
  static const _tokenKey = 'lm_smart_token';
  static const _userKey = 'lm_smart_user';

  Future<void> save({required String token, required AuthUser user}) async {
    web.window.localStorage.setItem(_tokenKey, token);
    web.window.localStorage.setItem(_userKey, jsonEncode(user.toJson()));
  }

  Future<String?> readToken() async => web.window.localStorage.getItem(_tokenKey);

  Future<AuthUser?> readUser() async {
    final raw = web.window.localStorage.getItem(_userKey);
    if (raw == null || raw.isEmpty) return null;
    return AuthUser.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  Future<void> clear() async {
    web.window.localStorage.removeItem(_tokenKey);
    web.window.localStorage.removeItem(_userKey);
  }
}
