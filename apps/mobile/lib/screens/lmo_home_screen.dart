import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_controller.dart';
import 'inspection_form_screen.dart';

class LmoHomeScreen extends StatefulWidget {
  const LmoHomeScreen({super.key, required this.auth});

  final AuthController auth;

  @override
  State<LmoHomeScreen> createState() => _LmoHomeScreenState();
}

class _LmoHomeScreenState extends State<LmoHomeScreen> {
  OfficerDashboard? _dashboard;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await widget.auth.api.officerDashboard();
      if (!mounted) return;
      setState(() {
        _dashboard = data;
        _loading = false;
      });
    } on ApiException catch (err) {
      if (!mounted) return;
      setState(() {
        _error = err.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load assigned inspections';
        _loading = false;
      });
    }
  }

  Future<void> _open(AssignedJob job) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => InspectionFormScreen(auth: widget.auth, job: job),
      ),
    );
    if (changed == true && mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.auth.user!;
    const navy = Color(0xFF0B3C6F);
    final jobs = _dashboard?.jobs ?? const <AssignedJob>[];
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: navy,
        foregroundColor: Colors.white,
        title: const Text('Assigned inspections'),
        actions: [
          IconButton(onPressed: _load, tooltip: 'Refresh', icon: const Icon(Icons.refresh)),
          IconButton(
            onPressed: widget.auth.logout,
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Welcome, ${user.fullName}', style: Theme.of(context).textTheme.titleLarge?.copyWith(color: navy)),
            Text(user.email, style: Theme.of(context).textTheme.bodyMedium),
            Text('Roles: ${user.roles.join(', ')}', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 16),
            if (_loading) const LinearProgressIndicator(),
            if (_error != null) Text(_error!, style: const TextStyle(color: Color(0xFFB91C1C))),
            if (_dashboard != null) ...[
              Row(
                children: [
                  _StatCard(label: 'Assigned', value: _dashboard!.assigned),
                  _StatCard(label: 'Upcoming', value: _dashboard!.upcoming),
                  _StatCard(label: 'Completed', value: _dashboard!.completed),
                ],
              ),
              const SizedBox(height: 16),
              Text('Field jobs', style: Theme.of(context).textTheme.titleMedium?.copyWith(color: navy)),
              const SizedBox(height: 8),
              if (jobs.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: Text(
                      'No assigned inspections. An admin must schedule and assign an application to this officer.',
                    ),
                  ),
                )
              else
                for (final job in jobs)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Card(
                      child: InkWell(
                        onTap: () => _open(job),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                job.businessName?.isNotEmpty == true
                                    ? '${job.businessName} · ${job.ownerName ?? ''}'
                                    : (job.ownerName ?? job.applicationNumber),
                                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: navy),
                              ),
                              const SizedBox(height: 6),
                              Text(job.applicationNumber, style: const TextStyle(color: Color(0xFF475569))),
                              Text('Type: ${job.instrumentType ?? '—'}'),
                              Text('Manufacturer / model: ${job.manufacturer ?? '—'} / ${job.model ?? '—'}'),
                              Text('Serial: ${job.serialNumber ?? '—'}'),
                              Text('Location: ${job.locationText?.isNotEmpty == true ? job.locationText : '—'}'),
                              Text('Scheduled: ${_fmt(job.scheduledAt)}'),
                              Text('Status: ${job.status}'),
                              const SizedBox(height: 8),
                              const Align(
                                alignment: Alignment.centerRight,
                                child: Text('Open inspection', style: TextStyle(color: navy, fontWeight: FontWeight.w600)),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
            ],
          ],
        ),
      ),
    );
  }

  String _fmt(DateTime? value) {
    if (value == null) return '—';
    final local = value.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${local.year}-${two(local.month)}-${two(local.day)} ${two(local.hour)}:${two(local.minute)}';
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value});

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              Text('$value', style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: const Color(0xFF0B3C6F))),
              Text(label, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}
