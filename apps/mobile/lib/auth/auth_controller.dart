import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../config.dart';
import 'session_store.dart';

class AuthController extends ChangeNotifier {
  AuthController({ApiClient? api, SessionStore? store})
      : _api = api ?? ApiClient(),
        _store = store ?? SessionStore();

  final ApiClient _api;
  final SessionStore _store;

  AuthUser? user;
  bool restoring = true;
  String? error;

  ApiClient get api => _api;
  bool get isSignedIn => user != null;

  Future<void> restore() async {
    restoring = true;
    notifyListeners();
    try {
      final storedUrl = await _store.readApiBaseUrl();
      _api.setBaseUrl(AppConfig.resolve(stored: storedUrl));
      final token = await _store.readToken();
      if (token == null) {
        user = null;
        return;
      }
      _api.setToken(token);
      user = await _api.currentUser();
    } catch (_) {
      await _store.clear();
      _api.setToken(null);
      user = null;
    } finally {
      restoring = false;
      notifyListeners();
    }
  }

  Future<void> applyBaseUrl(String url) async {
    final normalized = AppConfig.normalize(url);
    _api.setBaseUrl(normalized);
    await _store.saveApiBaseUrl(normalized);
  }

  Future<bool> login(String email, String password, {String? apiBaseUrl}) async {
    error = null;
    notifyListeners();
    try {
      if (apiBaseUrl != null && apiBaseUrl.trim().isNotEmpty) {
        await applyBaseUrl(apiBaseUrl);
      }
      final result = await _api.login(email: email, password: password);
      _api.setToken(result.token);
      final verified = await _api.currentUser();
      user = verified;
      await _store.save(token: result.token, user: verified);
      notifyListeners();
      return true;
    } on ApiException catch (err) {
      error = err.message;
      notifyListeners();
      return false;
    } catch (_) {
      error = 'Could not reach the LM Smart API at ${_api.baseUrl}. On a phone, use http://<laptop-LAN-IP>:4000 — not localhost.';
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    await _store.clear();
    _api.setToken(null);
    user = null;
    notifyListeners();
  }
}
