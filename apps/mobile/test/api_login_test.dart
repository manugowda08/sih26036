import 'package:flutter_test/flutter_test.dart';
import 'package:lm_smart/api/api_client.dart';

void main() {
  test('LMO login hits Fastify and returns JWT roles', () async {
    final api = ApiClient();
    final result = await api.login(
      email: 'lmo@lmsmart.demo',
      password: 'Demo@12345',
    );
    expect(result.token, isNotEmpty);
    expect(result.user.email, 'lmo@lmsmart.demo');
    expect(result.user.isLmo, isTrue);

    final me = await api.currentUser();
    expect(me.roles, contains('LMO'));

    final dash = await api.officerDashboard();
    expect(dash.assigned, greaterThanOrEqualTo(0));
  });
}
