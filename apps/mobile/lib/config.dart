/// Local Fastify API. Override with:
/// `flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000`
/// for the Android emulator.
class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://127.0.0.1:4000',
  );
}
