import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';

import '../api/api_client.dart';
import '../auth/auth_controller.dart';
import '../util/geo.dart';
import '../util/measurement.dart';

const _navy = Color(0xFF0B3C6F);

const _checklistLabels = <String, String>{
  'identificationVerified': 'Identification verified',
  'serialNumberMatches': 'Serial number matches',
  'physicalConditionOk': 'Physical condition OK',
  'displayFunctioning': 'Display functioning',
  'zeroIndicationChecked': 'Zero indication checked',
  'measurementAccuracyChecked': 'Measurement accuracy checked',
  'sealStampOk': 'Seal / stamp OK',
  'documentsChecked': 'Documents checked',
};

class InspectionFormScreen extends StatefulWidget {
  const InspectionFormScreen({super.key, required this.auth, required this.job});

  final AuthController auth;
  final AssignedJob job;

  @override
  State<InspectionFormScreen> createState() => _InspectionFormScreenState();
}

class _InspectionFormScreenState extends State<InspectionFormScreen> {
  InspectionDetail? _detail;
  String? _error;
  bool _loading = true;
  bool _saving = false;
  bool _uploadingPhoto = false;
  bool _capturingGps = false;

  final _testLoad = TextEditingController();
  final _observed = TextEditingController();
  final _remarks = TextEditingController();
  final _checklist = <String, bool>{for (final key in _checklistLabels.keys) key: false};

  String _result = 'PASS';
  Uint8List? _pendingPhoto;
  String _pendingName = 'inspection.jpg';
  GeoPoint? _gps;
  DateTime? _gpsAt;

  @override
  void initState() {
    super.initState();
    _testLoad.addListener(() => setState(() {}));
    _observed.addListener(() => setState(() {}));
    _open();
  }

  @override
  void dispose() {
    _testLoad.dispose();
    _observed.dispose();
    _remarks.dispose();
    super.dispose();
  }

  Future<void> _open() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      InspectionDetail detail;
      if (widget.job.inspectionId != null) {
        detail = await widget.auth.api.getInspection(widget.job.inspectionId!);
      } else {
        detail = await widget.auth.api.startInspection(widget.job.applicationId);
      }
      if (!mounted) return;
      _applyDetail(detail);
    } on ApiException catch (err) {
      if (!mounted) return;
      setState(() {
        _error = err.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not open this inspection';
        _loading = false;
      });
    }
  }

  void _applyDetail(InspectionDetail detail) {
    for (final key in _checklistLabels.keys) {
      _checklist[key] = detail.checklist[key] ?? false;
    }
    if (detail.remarks != null && detail.remarks!.isNotEmpty) {
      _remarks.text = detail.remarks!;
    }
    if (detail.measurements.isNotEmpty) {
      final last = detail.measurements.last;
      _testLoad.text = last.testLoad.toString();
      _observed.text = last.observedValue.toString();
    }
    if (detail.result != null) _result = detail.result!;
    if (detail.fieldLat != null && detail.fieldLng != null) {
      _gps = GeoPoint(latitude: detail.fieldLat!, longitude: detail.fieldLng!);
      _gpsAt ??= DateTime.now();
    }
    setState(() {
      _detail = detail;
      _loading = false;
      _error = null;
    });
  }

  double? get _testLoadValue => double.tryParse(_testLoad.text.trim());
  double? get _observedValue => double.tryParse(_observed.text.trim());
  double? get _liveError {
    final load = _testLoadValue;
    final observed = _observedValue;
    if (load == null || observed == null) return null;
    return calculatedError(observed, load);
  }

  bool get _mismatch {
    final gps = _gps;
    final detail = _detail;
    if (gps == null || detail?.instrumentLat == null || detail?.instrumentLng == null) {
      return false;
    }
    final metres = distanceMetres(
      gps,
      GeoPoint(latitude: detail!.instrumentLat!, longitude: detail.instrumentLng!),
    );
    return metres > mismatchThresholdMetres;
  }

  double? get _mismatchMetres {
    final gps = _gps;
    final detail = _detail;
    if (gps == null || detail?.instrumentLat == null || detail?.instrumentLng == null) {
      return null;
    }
    return distanceMetres(
      gps,
      GeoPoint(latitude: detail!.instrumentLat!, longitude: detail.instrumentLng!),
    );
  }

  double get _tolerance => _detail?.permissibleError ?? 0.5;

  double get _capacity {
    final raw = _detail?.capacity;
    if (raw != null) {
      final match = RegExp(r'[\d.]+').firstMatch(raw);
      final parsed = double.tryParse(match?.group(0) ?? '');
      if (parsed != null) return parsed;
    }
    return _testLoadValue ?? 0;
  }

  Future<void> _takePhoto() async {
    try {
      final file = await ImagePicker().pickImage(
        source: ImageSource.camera,
        imageQuality: 75,
        maxWidth: 1920,
      );
      if (file == null) return;
      final bytes = await file.readAsBytes();
      if (!mounted) return;
      setState(() {
        _pendingPhoto = bytes;
        _pendingName = file.name.toLowerCase().endsWith('.png') ? file.name : 'inspection.jpg';
        _error = null;
      });
    } catch (err) {
      if (!mounted) return;
      setState(() => _error = 'Camera is not available: $err');
    }
  }

  Future<void> _uploadPhoto() async {
    final detail = _detail;
    final bytes = _pendingPhoto;
    if (detail == null || bytes == null) return;
    setState(() {
      _uploadingPhoto = true;
      _error = null;
    });
    try {
      final updated = await widget.auth.api.uploadPhoto(
        detail.id,
        bytes: bytes,
        filename: _pendingName,
        latitude: _gps?.latitude,
        longitude: _gps?.longitude,
      );
      if (!mounted) return;
      setState(() {
        _pendingPhoto = null;
        _uploadingPhoto = false;
      });
      _applyDetail(updated);
    } on ApiException catch (err) {
      if (!mounted) return;
      setState(() {
        _error = err.message;
        _uploadingPhoto = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Photo upload failed';
        _uploadingPhoto = false;
      });
    }
  }

  Future<void> _captureGps() async {
    setState(() {
      _capturingGps = true;
      _error = null;
    });
    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) {
        setState(() {
          _error = 'Turn on location services to capture GPS';
          _capturingGps = false;
        });
        return;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        setState(() {
          _error = 'Location permission is required to capture GPS. Grant it in system settings.';
          _capturingGps = false;
        });
        return;
      }
      final position = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high));
      if (!mounted) return;
      setState(() {
        _gps = GeoPoint(latitude: position.latitude, longitude: position.longitude, timestamp: position.timestamp);
        _gpsAt = position.timestamp;
        _capturingGps = false;
      });
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not capture GPS: $err';
        _capturingGps = false;
      });
    }
  }

  String? _validate() {
    if (_detail == null) return 'Inspection is not loaded';
    if (_testLoadValue == null) return 'Enter a test load';
    if (_observedValue == null) return 'Enter the observed measurement';
    if (_checklist.values.any((value) => !value)) return 'Complete every checklist item';
    if (_detail!.photos.isEmpty && _pendingPhoto == null) return 'Take and upload an inspection photo';
    if (_pendingPhoto != null) return 'Upload the photo before submitting';
    if (_gps == null) return 'Capture GPS before submitting';
    return null;
  }

  Future<void> _submit() async {
    final problem = _validate();
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    final detail = _detail!;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.auth.api.updateInspection(
        detail.id,
        remarks: _remarks.text.trim().isEmpty ? null : _remarks.text.trim(),
        locationMismatch: _mismatch,
        latitude: _gps!.latitude,
        longitude: _gps!.longitude,
        checklist: Map<String, bool>.from(_checklist),
      );
      await widget.auth.api.addMeasurement(
        detail.id,
        capacity: _capacity,
        testLoad: _testLoadValue!,
        observedValue: _observedValue!,
        permissibleError: _tolerance,
      );
      final completed = await widget.auth.api.completeInspection(
        detail.id,
        result: _result,
        remarks: _remarks.text.trim().isEmpty ? null : _remarks.text.trim(),
      );
      if (!mounted) return;
      _applyDetail(completed);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Inspection submitted')));
      Navigator.of(context).pop(true);
    } on ApiException catch (err) {
      if (!mounted) return;
      setState(() {
        _error = err.message;
        _saving = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Submit failed. Check the API and try again.';
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final job = widget.job;
    final detail = _detail;
    final locked = detail?.isLocked == true;
    final errorValue = _liveError;
    final inspectionTime = detail?.startedAt?.toLocal() ?? DateTime.now();

    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        title: Text(job.applicationNumber.isEmpty ? 'Inspection' : job.applicationNumber),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                if (_error != null)
                  Card(
                    color: const Color(0xFFFEE2E2),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(_error!, style: const TextStyle(color: Color(0xFF991B1B), fontSize: 16)),
                    ),
                  ),
                _section(
                  'Instrument',
                  [
                    _kv('Business / owner', [job.businessName, job.ownerName, detail?.businessName, detail?.ownerName].whereType<String>().where((s) => s.isNotEmpty).join(' · ')),
                    _kv('Type', detail?.instrumentType ?? job.instrumentType ?? '—'),
                    _kv('Manufacturer / model', '${detail?.manufacturer ?? job.manufacturer ?? '—'} / ${detail?.model ?? job.model ?? '—'}'),
                    _kv('Serial', detail?.serialNumber ?? job.serialNumber ?? '—'),
                    _kv('Code', detail?.instrumentCode ?? job.instrumentCode ?? '—'),
                    _kv('Capacity', detail?.capacity ?? '—'),
                    _kv('Location', detail?.locationText ?? job.locationText ?? '—'),
                    _kv('Scheduled', _fmt(detail?.scheduledAt ?? job.scheduledAt)),
                    _kv('Status', detail?.applicationStatus ?? job.status),
                    _kv('Inspection date/time', _fmt(inspectionTime)),
                  ],
                ),
                _section(
                  'Measurements',
                  [
                    Text(
                      'Prototype tolerance (instrument type configuration — not a legal MPE table): ±$_tolerance ${detail?.unit ?? ''}'.trim(),
                      style: const TextStyle(fontSize: 14, color: Color(0xFF475569)),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _testLoad,
                      enabled: !locked,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                      style: const TextStyle(fontSize: 20),
                      decoration: const InputDecoration(
                        labelText: 'Test load',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _observed,
                      enabled: !locked,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                      style: const TextStyle(fontSize: 20),
                      decoration: const InputDecoration(
                        labelText: 'Observed measurement',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE0F2FE),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        errorValue == null
                            ? 'Error = observed − test load\nEnter both values to calculate'
                            : 'Error = ${errorValue.toStringAsFixed(4)}\n(observed − test load)',
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: _navy),
                      ),
                    ),
                    if (errorValue != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          withinPrototypeTolerance(errorValue, _tolerance)
                              ? 'Within prototype tolerance'
                              : 'Outside prototype tolerance (officer still chooses the result)',
                          style: TextStyle(
                            fontSize: 15,
                            color: withinPrototypeTolerance(errorValue, _tolerance)
                                ? const Color(0xFF166534)
                                : const Color(0xFF9A3412),
                          ),
                        ),
                      ),
                  ],
                ),
                _section(
                  'Checklist',
                  [
                    for (final entry in _checklistLabels.entries)
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        value: _checklist[entry.key] ?? false,
                        onChanged: locked
                            ? null
                            : (value) => setState(() => _checklist[entry.key] = value),
                        title: Text(entry.value, style: const TextStyle(fontSize: 17)),
                      ),
                  ],
                ),
                _section(
                  'Photo',
                  [
                    if (_pendingPhoto != null) ...[
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.memory(_pendingPhoto!, height: 220, fit: BoxFit.cover),
                      ),
                      const SizedBox(height: 8),
                      Text('Preview — upload to attach to this inspection', style: Theme.of(context).textTheme.bodySmall),
                    ] else if (detail != null && detail.photos.isNotEmpty)
                      Text('${detail.photos.length} photo(s) uploaded to this inspection', style: const TextStyle(fontSize: 16)),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        SizedBox(
                          height: 52,
                          child: FilledButton.icon(
                            onPressed: locked ? null : _takePhoto,
                            icon: const Icon(Icons.photo_camera),
                            label: Text(_pendingPhoto == null ? 'Take photo' : 'Retake'),
                          ),
                        ),
                        if (_pendingPhoto != null)
                          SizedBox(
                            height: 52,
                            child: OutlinedButton(
                              onPressed: locked ? null : () => setState(() => _pendingPhoto = null),
                              child: const Text('Delete'),
                            ),
                          ),
                        if (_pendingPhoto != null)
                          SizedBox(
                            height: 52,
                            child: FilledButton.tonal(
                              onPressed: locked || _uploadingPhoto ? null : _uploadPhoto,
                              child: Text(_uploadingPhoto ? 'Uploading…' : 'Upload photo'),
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
                _section(
                  'GPS',
                  [
                    if (_gps == null)
                      const Text('No field location captured yet', style: TextStyle(fontSize: 16))
                    else ...[
                      Text('Latitude: ${_gps!.latitude.toStringAsFixed(6)}', style: const TextStyle(fontSize: 16)),
                      Text('Longitude: ${_gps!.longitude.toStringAsFixed(6)}', style: const TextStyle(fontSize: 16)),
                      Text('Timestamp: ${_fmt(_gpsAt)}', style: const TextStyle(fontSize: 16)),
                    ],
                    if (_mismatch)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Card(
                          color: const Color(0xFFFFEDD5),
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Text(
                              'Location warning: captured GPS is about ${_mismatchMetres!.round()} m from the registered instrument location (prototype threshold ${mismatchThresholdMetres.round()} m). This does not reject the inspection.',
                              style: const TextStyle(fontSize: 16, color: Color(0xFF9A3412)),
                            ),
                          ),
                        ),
                      ),
                    const SizedBox(height: 12),
                    SizedBox(
                      height: 52,
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: locked || _capturingGps ? null : _captureGps,
                        icon: const Icon(Icons.my_location),
                        label: Text(_capturingGps ? 'Capturing…' : 'Capture GPS'),
                      ),
                    ),
                  ],
                ),
                _section(
                  'Remarks and result',
                  [
                    TextField(
                      controller: _remarks,
                      enabled: !locked,
                      maxLines: 4,
                      style: const TextStyle(fontSize: 16),
                      decoration: const InputDecoration(
                        labelText: 'Remarks',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text('Result', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    for (final value in const ['PASS', 'FAIL', 'REQUIRES_REVIEW'])
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: SizedBox(
                          width: double.infinity,
                          height: 52,
                          child: FilledButton(
                            style: FilledButton.styleFrom(
                              backgroundColor: _result == value ? _navy : Colors.white,
                              foregroundColor: _result == value ? Colors.white : _navy,
                              side: const BorderSide(color: _navy),
                            ),
                            onPressed: locked ? null : () => setState(() => _result = value),
                            child: Text(value.replaceAll('_', ' ')),
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                if (!locked)
                  SizedBox(
                    height: 56,
                    child: FilledButton(
                      onPressed: _saving ? null : _submit,
                      child: Text(_saving ? 'Submitting…' : 'Submit inspection'),
                    ),
                  )
                else
                  const Text('This inspection is already submitted.', style: TextStyle(fontSize: 16)),
              ],
            ),
    );
  }

  Widget _section(String title, List<Widget> children) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _navy)),
            const SizedBox(height: 12),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _kv(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 13, color: Color(0xFF64748B))),
          Text(value.isEmpty ? '—' : value, style: const TextStyle(fontSize: 17)),
        ],
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
