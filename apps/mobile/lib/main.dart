import 'package:flutter/material.dart';

import 'app.dart';
import 'auth/auth_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final auth = AuthController();
  await auth.restore();
  runApp(LmSmartApp(auth: auth));
}
