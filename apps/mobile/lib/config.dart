/// Fastify API base URL.
///
/// Priority:
/// 1. `--dart-define=API_BASE_URL=http://<LAPTOP_LAN_IP>:4000` (physical phone / CI)
/// 2. Value saved on the sign-in screen
/// 3. Loopback fallback for desktop/web only
///
/// Do not use `127.0.0.1` or `localhost` on a physical Android phone — that
/// address is the phone itself, not the laptop running the API.
class AppConfig {
  static const dartDefine = String.fromEnvironment('API_BASE_URL', defaultValue: '');
  static const fallback = 'http://127.0.0.1:4000';

  static String get apiBaseUrl => normalize(dartDefine.isNotEmpty ? dartDefine : fallback);

  static String normalize(String url) => url.trim().replaceAll(RegExp(r'/$'), '');

  static String resolve({String? stored}) {
    if (dartDefine.isNotEmpty) return normalize(dartDefine);
    if (stored != null && stored.trim().isNotEmpty) return normalize(stored);
    return fallback;
  }

  static bool isLoopback(String url) {
    final host = Uri.tryParse(url)?.host.toLowerCase() ?? '';
    return host == '127.0.0.1' || host == 'localhost' || host == '::1' || host == '0.0.0.0';
  }
}
