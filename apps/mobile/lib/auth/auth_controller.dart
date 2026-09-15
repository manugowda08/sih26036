import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
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

  Future<bool> login(String email, String password) async {
    error = null;
    notifyListeners();
    try {
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
      error = 'Could not reach the LM Smart API at ${_api.baseUrl}';
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
