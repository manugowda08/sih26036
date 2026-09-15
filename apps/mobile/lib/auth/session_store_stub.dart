import '../api/api_client.dart';

class SessionStore {
  Future<void> save({required String token, required AuthUser user}) async {}

  Future<String?> readToken() async => null;

  Future<AuthUser?> readUser() async => null;

  Future<void> clear() async {}
}
