import 'package:flutter/material.dart';

import 'auth/auth_controller.dart';
import 'offline/offline_controller.dart';
import 'screens/lmo_home_screen.dart';
import 'screens/login_screen.dart';
import 'screens/role_gate_screen.dart';

class LmSmartApp extends StatelessWidget {
  LmSmartApp({super.key, required this.auth, OfflineController? offline})
      : offline = offline ?? OfflineController();

  final AuthController auth;
  final OfflineController offline;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LM Smart',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0B3C6F)),
        useMaterial3: true,
      ),
      home: ListenableBuilder(
        listenable: Listenable.merge([auth, offline]),
        builder: (context, _) {
          if (auth.restoring) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
          if (!auth.isSignedIn) {
            return LoginScreen(auth: auth);
          }
          if (auth.user!.isFieldOfficer) {
            return LmoHomeScreen(auth: auth, offline: offline);
          }
          return RoleGateScreen(auth: auth);
        },
      ),
    );
  }
}
