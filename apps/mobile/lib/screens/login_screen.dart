import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';
import '../config.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.auth});

  final AuthController auth;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController(text: 'lmo@lmsmart.demo');
  final _password = TextEditingController();
  late final TextEditingController _apiUrl;
  bool _pending = false;

  @override
  void initState() {
    super.initState();
    _apiUrl = TextEditingController(text: widget.auth.api.baseUrl);
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _apiUrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _pending = true);
    await widget.auth.login(
      _email.text,
      _password.text,
      apiBaseUrl: _apiUrl.text,
    );
    if (mounted) setState(() => _pending = false);
  }

  @override
  Widget build(BuildContext context) {
    const navy = Color(0xFF0B3C6F);
    final loopback = AppConfig.isLoopback(_apiUrl.text);
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      body: Column(
        children: [
          Container(height: 6, color: const Color(0xFFFF9933)),
          Expanded(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Card(
                  margin: const EdgeInsets.all(24),
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: SingleChildScrollView(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text('LM SMART', style: TextStyle(color: navy, letterSpacing: 2, fontSize: 12)),
                          const SizedBox(height: 4),
                          Text(
                            'Field officer sign-in',
                            style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: navy, fontWeight: FontWeight.w600),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Demo LMO: lmo@lmsmart.demo / Demo@12345',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          const SizedBox(height: 20),
                          TextField(
                            controller: _apiUrl,
                            keyboardType: TextInputType.url,
                            onChanged: (_) => setState(() {}),
                            decoration: const InputDecoration(
                              labelText: 'API base URL',
                              hintText: 'http://192.168.x.x:4000',
                              helperText: 'On a physical phone use the laptop Wi-Fi/LAN IP, not localhost.',
                              helperMaxLines: 2,
                              border: OutlineInputBorder(),
                            ),
                          ),
                          if (loopback) ...[
                            const SizedBox(height: 8),
                            const Text(
                              'localhost / 127.0.0.1 only works on this computer. Android emulator: http://10.0.2.2:4000. Physical phone: http://<laptop-LAN-IP>:4000.',
                              style: TextStyle(color: Color(0xFF9A3412), fontSize: 13),
                            ),
                          ],
                          const SizedBox(height: 12),
                          TextField(
                            controller: _email,
                            keyboardType: TextInputType.emailAddress,
                            autofillHints: const [AutofillHints.username],
                            decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _password,
                            obscureText: true,
                            autofillHints: const [AutofillHints.password],
                            decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder()),
                            onSubmitted: (_) => _pending ? null : _submit(),
                          ),
                          if (widget.auth.error != null) ...[
                            const SizedBox(height: 12),
                            Text(widget.auth.error!, style: const TextStyle(color: Color(0xFFB91C1C))),
                          ],
                          const SizedBox(height: 16),
                          FilledButton(
                            onPressed: _pending ? null : _submit,
                            style: FilledButton.styleFrom(backgroundColor: navy, padding: const EdgeInsets.symmetric(vertical: 14)),
                            child: Text(_pending ? 'Signing in…' : 'Sign in'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
