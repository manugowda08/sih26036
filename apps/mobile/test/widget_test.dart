import 'package:flutter_test/flutter_test.dart';
import 'package:lm_smart/app.dart';
import 'package:lm_smart/auth/auth_controller.dart';

void main() {
  testWidgets('shows login screen when signed out', (tester) async {
    final auth = AuthController();
    auth.restoring = false;
    await tester.pumpWidget(LmSmartApp(auth: auth));
    expect(find.text('Field officer sign-in'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
  });
}
