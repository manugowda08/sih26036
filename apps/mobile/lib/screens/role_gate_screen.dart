import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';

class RoleGateScreen extends StatelessWidget {
  const RoleGateScreen({super.key, required this.auth});

  final AuthController auth;

  @override
  Widget build(BuildContext context) {
    final user = auth.user!;
    return Scaffold(
      appBar: AppBar(
        title: const Text('LM Smart'),
        actions: [
          IconButton(onPressed: auth.logout, icon: const Icon(Icons.logout)),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'Signed in as ${user.fullName} (${user.roles.join(', ')}).\n\nThis Phase 7 Step 1 field app is for LMO / GATC officers. Use the web portal for owner and admin work.',
        ),
      ),
    );
  }
}
