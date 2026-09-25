import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_controller.dart';
import '../offline/offline_controller.dart';
import '../offline/models.dart';
import 'inspection_details_screen.dart';

class LmoHomeScreen extends StatefulWidget {
  const LmoHomeScreen({super.key, required this.auth, required this.offline});

  final AuthController auth;
  final OfflineController offline;

  @override
  State<LmoHomeScreen> createState() => _LmoHomeScreenState();
}

class _LmoHomeScreenState extends State<LmoHomeScreen> {
  OfficerDashboard? _dashboard;
  List<AssignedJob> _jobs = const [];
  Map<String, InspectionDraft> _drafts = {};
  String? _error;
  bool _loading = true;

  String get _officerId => widget.auth.user!.id;

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
    final reachable = await widget.offline.probe(widget.auth.api);
    if (reachable) {
      try {
        final data = await widget.auth.api.officerDashboard();
        await widget.offline.cacheAssignments(officerId: _officerId, jobs: data.jobs);
        if (!mounted) return;
        setState(() {
          _dashboard = data;
          _jobs = data.jobs;
          _loading = false;
        });
      } catch (err) {
        await _loadCached(
          fallbackError: err is ApiException ? err.message : 'Could not load assigned inspections',
        );
      }
    } else {
      await _loadCached(fallbackError: 'Showing cached inspections');
    }
    _drafts = await widget.offline.draftsByApplication(_officerId);
    if (mounted) setState(() {});
  }

  Future<void> _loadCached({String? fallbackError}) async {
    final jobs = await widget.offline.cachedAssignments(_officerId);
    if (!mounted) return;
    setState(() {
      _jobs = jobs;
      _dashboard ??= OfficerDashboard(assignedCount: jobs.length, upcoming: 0, completed: 0, jobs: jobs);
      _error = jobs.isEmpty
          ? 'No cached inspections. Connect to the LM Smart API and refresh while online.'
          : fallbackError;
      _loading = false;
    });
  }

  Future<void> _syncNow() async {
    final report = await widget.offline.syncNow(api: widget.auth.api, officerId: _officerId);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(widget.offline.lastSyncMessage ?? (report.ok ? 'Synchronization complete' : 'Sync failed'))),
    );
    await _load();
  }

  Future<void> _open(AssignedJob job) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => InspectionDetailsScreen(auth: widget.auth, offline: widget.offline, job: job),
      ),
    );
    if (changed == true && mounted) await _load();
  }

  Future<void> _logout() async {
    final pending = await widget.offline.store.queuedCount(_officerId);
    if (!mounted) return;
    if (pending > 0) {
      final proceed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Inspections pending synchronization'),
          content: const Text(
            'There are inspections pending synchronization. Logging out will not delete them, but they must be synchronized before this device\'s field records are considered submitted.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Stay signed in')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sign out')),
          ],
        ),
      );
      if (proceed != true) return;
    }
    await widget.auth.logout();
  }

  String _syncLabel(InspectionDraft? draft) {
    if (draft == null) return '';
    if (!draft.submittedLocally && draft.syncStatus == SyncStatus.synced) return 'Synced';
    if (!draft.submittedLocally) return '';
    switch (draft.syncStatus) {
      case SyncStatus.synced:
        return 'Synced';
      case SyncStatus.syncing:
        return 'Syncing';
      case SyncStatus.failed:
        return 'Sync Failed';
      default:
        return 'Pending Sync';
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.auth.user!;
    const navy = Color(0xFF0B3C6F);
    final online = widget.offline.connectivity.apiReachable;
    final pending = widget.offline.pendingCount;
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: navy,
        foregroundColor: Colors.white,
        title: const Text('LMO dashboard'),
        actions: [
          IconButton(onPressed: _load, tooltip: 'Refresh', icon: const Icon(Icons.refresh)),
          IconButton(
            onPressed: _logout,
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
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: online ? const Color(0xFFDCFCE7) : const Color(0xFFFEF3C7),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                online
                    ? 'ONLINE — connected to the LM Smart API'
                    : widget.offline.showingCached
                        ? 'OFFLINE MODE — showing cached inspections'
                        : 'OFFLINE — LM Smart API is not reachable',
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: online ? const Color(0xFF166534) : const Color(0xFF9A3412),
                ),
              ),
            ),
            if (pending > 0) ...[
              const SizedBox(height: 12),
              Card(
                color: const Color(0xFFFFF7ED),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '$pending inspection${pending == 1 ? '' : 's'} pending synchronization',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 8),
                      FilledButton(
                        onPressed: widget.offline.syncing ? null : _syncNow,
                        child: Text(widget.offline.syncing ? 'Syncing…' : 'Sync Now'),
                      ),
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: 16),
            if (_loading) const LinearProgressIndicator(),
            if (_error != null) Text(_error!, style: const TextStyle(color: Color(0xFFB91C1C))),
            if (_dashboard != null) ...[
              Row(
                children: [
                  _StatCard(label: 'Assigned', value: _jobs.length),
                  _StatCard(label: 'Upcoming', value: _dashboard!.upcoming),
                  _StatCard(label: 'Completed', value: _dashboard!.completed),
                ],
              ),
              const SizedBox(height: 16),
              Text('Assigned inspections', style: Theme.of(context).textTheme.titleMedium?.copyWith(color: navy)),
              const SizedBox(height: 8),
              if (_jobs.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: Text(
                      'No assigned inspections. An admin must schedule and assign an application to this officer.',
                    ),
                  ),
                )
              else
                for (final job in _jobs)
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
                              if (_syncLabel(_drafts[job.applicationId]).isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: 6),
                                  child: Text(
                                    _syncLabel(_drafts[job.applicationId]),
                                    style: const TextStyle(fontWeight: FontWeight.w700, color: navy),
                                  ),
                                ),
                              const SizedBox(height: 8),
                              const Align(
                                alignment: Alignment.centerRight,
                                child: Text('View details', style: TextStyle(color: navy, fontWeight: FontWeight.w600)),
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
