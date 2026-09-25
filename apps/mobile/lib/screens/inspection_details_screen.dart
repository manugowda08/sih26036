import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../auth/auth_controller.dart';
import '../offline/offline_controller.dart';
import 'inspection_form_screen.dart';

String formatDateTime(DateTime? value) {
  if (value == null) return '—';
  final local = value.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${local.year}-${two(local.month)}-${two(local.day)} ${two(local.hour)}:${two(local.minute)}';
}

class InspectionDetailsScreen extends StatefulWidget {
  const InspectionDetailsScreen({super.key, required this.auth, required this.offline, required this.job});

  final AuthController auth;
  final OfflineController offline;
  final AssignedJob job;

  @override
  State<InspectionDetailsScreen> createState() => _InspectionDetailsScreenState();
}

class _InspectionDetailsScreenState extends State<InspectionDetailsScreen> {
  InspectionDetail? _detail;
  String? _error;
  bool _loading = false;
  bool _starting = false;

  @override
  void initState() {
    super.initState();
    _loadExisting();
  }

  Future<void> _loadExisting() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final officerId = widget.auth.user!.id;
    final draft = await widget.offline.draftFor(officerId: officerId, applicationId: widget.job.applicationId);
    if (draft != null && (draft.submittedLocally || draft.measurements.isNotEmpty || draft.photos.isNotEmpty)) {
      if (!mounted) return;
      setState(() {
        _detail = draft.toDetail();
        _loading = false;
      });
    }
    if (widget.job.inspectionId == null && draft?.serverInspectionId == null) {
      if (!mounted) return;
      setState(() => _loading = false);
      return;
    }
    try {
      final id = widget.job.inspectionId ?? draft!.serverInspectionId!;
      final detail = await widget.auth.api.getInspection(id);
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _loading = false;
        _error = null;
      });
    } on ApiException catch (err) {
      if (!mounted) return;
      setState(() {
        _error = _detail == null ? err.message : 'Showing cached inspection details (API unavailable)';
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        if (_detail == null) _error = 'Could not load inspection details';
        _loading = false;
      });
    }
  }

  Future<void> _startOrContinue() async {
    setState(() {
      _starting = true;
      _error = null;
    });
    final officerId = widget.auth.user!.id;
    final draft = await widget.offline.ensureDraft(officerId: officerId, job: widget.job);
    InspectionDetail detail = draft.toDetail();
    try {
      if (widget.job.inspectionId != null || draft.serverInspectionId != null) {
        detail = await widget.auth.api.getInspection(widget.job.inspectionId ?? draft.serverInspectionId!);
        draft.serverInspectionId = detail.id;
        await widget.offline.store.saveDraft(draft);
      } else {
        detail = await widget.auth.api.startInspection(widget.job.applicationId);
        draft.serverInspectionId = detail.id;
        await widget.offline.store.saveDraft(draft);
      }
    } catch (_) {
      detail = draft.toDetail();
    }
    if (!mounted) return;
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => InspectionFormScreen(
          auth: widget.auth,
          offline: widget.offline,
          job: widget.job,
          initial: detail,
          draft: draft,
        ),
      ),
    );
    if (changed == true && mounted) {
      Navigator.of(context).pop(true);
    } else if (mounted) {
      setState(() {
        _detail = detail;
        _starting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    const navy = Color(0xFF0B3C6F);
    final job = widget.job;
    final detail = _detail;
    final started = job.inspectionId != null || detail != null;
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: navy,
        foregroundColor: Colors.white,
        title: const Text('Inspection details'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null)
            Card(
              color: const Color(0xFFFEE2E2),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text(_error!, style: const TextStyle(color: Color(0xFF991B1B))),
              ),
            ),
          if (_loading) const LinearProgressIndicator(),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Assigned application', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: navy)),
                  const SizedBox(height: 12),
                  _kv('Application number', detail?.applicationNumber ?? job.applicationNumber),
                  _kv('Owner', detail?.ownerName ?? job.ownerName ?? '—'),
                  _kv('Business', detail?.businessName ?? job.businessName ?? '—'),
                  _kv('Instrument', detail?.instrumentType ?? job.instrumentType ?? '—'),
                  _kv('Manufacturer', detail?.manufacturer ?? job.manufacturer ?? '—'),
                  _kv('Model', detail?.model ?? job.model ?? '—'),
                  _kv('Serial number', detail?.serialNumber ?? job.serialNumber ?? '—'),
                  _kv('Instrument code', detail?.instrumentCode ?? job.instrumentCode ?? '—'),
                  _kv('Capacity / range', detail?.capacity ?? job.capacity ?? '—'),
                  _kv('Location', (detail?.locationText?.isNotEmpty == true ? detail!.locationText : job.locationText) ?? '—'),
                  _kv('Registered coordinates', _coords(detail?.instrumentLat ?? job.instrumentLat, detail?.instrumentLng ?? job.instrumentLng)),
                  _kv('Scheduled inspection', formatDateTime(detail?.scheduledAt ?? job.scheduledAt)),
                  _kv('Application status', detail?.applicationStatus ?? job.status),
                  _kv('Kind', job.kind),
                  if (detail?.startedAt != null) _kv('Inspection started', formatDateTime(detail!.startedAt)),
                  if (detail?.submittedAt != null) _kv('Submitted', formatDateTime(detail!.submittedAt)),
                  if (detail?.result != null) _kv('Result', detail!.result!),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 52,
            child: FilledButton(
              onPressed: _starting ? null : _startOrContinue,
              child: Text(
                _starting
                    ? 'Opening…'
                    : detail?.isLocked == true
                        ? 'View submitted inspection'
                        : started
                            ? 'Continue inspection'
                            : 'Start inspection',
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _coords(double? lat, double? lng) {
    if (lat == null || lng == null) return 'Not registered';
    return '${lat.toStringAsFixed(6)}, ${lng.toStringAsFixed(6)}';
  }

  Widget _kv(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 13, color: Color(0xFF64748B))),
          Text(value.isEmpty ? '—' : value, style: const TextStyle(fontSize: 17)),
        ],
      ),
    );
  }
}
