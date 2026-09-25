import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';

import '../api/api_client.dart';
import '../auth/auth_controller.dart';
import '../util/geo.dart';
import '../util/measurement.dart';
import 'inspection_details_screen.dart';

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

const _photoKinds = <String, String>{
  'INSTRUMENT_FRONT': 'Instrument front',
  'SERIAL_NUMBER': 'Serial number',
  'SEAL_STAMP': 'Seal / stamp',
  'LOCATION_CONTEXT': 'Location context',
  'MEASUREMENT_DISPLAY': 'Measurement display',
};

class InspectionFormScreen extends StatefulWidget {
  const InspectionFormScreen({
    super.key,
    required this.auth,
    required this.job,
    required this.initial,
  });

  final AuthController auth;
  final AssignedJob job;
  final InspectionDetail initial;

  @override
  State<InspectionFormScreen> createState() => _InspectionFormScreenState();
}

class _InspectionFormScreenState extends State<InspectionFormScreen> {
  late InspectionDetail _detail;
  String? _error;
  bool _saving = false;
  bool _uploadingPhoto = false;
  bool _capturingGps = false;
  bool _addingMeasurement = false;
  int _step = 0;

  final _testLoad = TextEditingController();
  final _observed = TextEditingController();
  final _remarks = TextEditingController();
  final _checklist = <String, bool>{for (final key in _checklistLabels.keys) key: false};

  String _result = 'PASS';
  String _photoKind = 'INSTRUMENT_FRONT';
  bool _locationMismatch = false;
  Uint8List? _pendingPhoto;
  String _pendingName = 'inspection.jpg';
  GeoPoint? _gps;
  DateTime? _gpsAt;

  @override
  void initState() {
    super.initState();
    _testLoad.addListener(() => setState(() {}));
    _observed.addListener(() => setState(() {}));
    _hydrate(widget.initial);
    if (_detail.isLocked) _step = 4;
  }

  void _hydrate(InspectionDetail detail) {
    _detail = detail;
    for (final key in _checklistLabels.keys) {
      _checklist[key] = detail.checklist[key] ?? false;
    }
    if (detail.remarks != null && detail.remarks!.isNotEmpty) {
      _remarks.text = detail.remarks!;
    }
    if (detail.result != null) _result = detail.result!;
    _locationMismatch = detail.locationMismatch;
    if (detail.fieldLat != null && detail.fieldLng != null) {
      _gps = GeoPoint(latitude: detail.fieldLat!, longitude: detail.fieldLng!);
      _gpsAt ??= DateTime.now();
    }
  }

  void _applyDetail(InspectionDetail detail, {bool resetStep = false}) {
    _hydrate(detail);
    setState(() {
      _error = null;
      if (resetStep && detail.isLocked) _step = 4;
    });
  }

  @override
  void dispose() {
    _testLoad.dispose();
    _observed.dispose();
    _remarks.dispose();
    super.dispose();
  }

  double? get _testLoadValue => double.tryParse(_testLoad.text.trim());
  double? get _observedValue => double.tryParse(_observed.text.trim());
  double? get _liveError {
    final load = _testLoadValue;
    final observed = _observedValue;
    if (load == null || observed == null) return null;
    return calculatedError(observed, load);
  }

  double? get _distanceMetres {
    final gps = _gps;
    final lat = _detail.instrumentLat;
    final lng = _detail.instrumentLng;
    if (gps == null || lat == null || lng == null) return null;
    return distanceMetres(gps, GeoPoint(latitude: lat, longitude: lng));
  }

  double get _tolerance => _detail.permissibleError;

  double get _capacity {
    final raw = _detail.capacity;
    if (raw != null) {
      final match = RegExp(r'[\d.]+').firstMatch(raw);
      final parsed = double.tryParse(match?.group(0) ?? '');
      if (parsed != null) return parsed;
    }
    return _testLoadValue ?? 0;
  }

  String get _unit => _detail.unit ?? '';

  Future<void> _takePhoto() async {
    try {
      final status = await Permission.camera.request();
      if (!status.isGranted) {
        setState(() => _error = status.isPermanentlyDenied
            ? 'Camera permission is denied. Enable it in system settings.'
            : 'Camera permission is required to capture evidence.');
        if (status.isPermanentlyDenied) await openAppSettings();
        return;
      }
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
    final bytes = _pendingPhoto;
    if (bytes == null) return;
    setState(() {
      _uploadingPhoto = true;
      _error = null;
    });
    try {
      final updated = await widget.auth.api.uploadPhoto(
        _detail.id,
        bytes: bytes,
        filename: _pendingName,
        kind: _photoKind,
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
        _error = 'Photo upload failed. Check the API connection and try again.';
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
          _error = 'Location services are turned off. Enable GPS and try again.';
          _capturingGps = false;
        });
        return;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied) {
        setState(() {
          _error = 'Location permission was denied. Allow location access to verify this inspection.';
          _capturingGps = false;
        });
        return;
      }
      if (permission == LocationPermission.deniedForever) {
        setState(() {
          _error = 'Location permission is blocked. Enable it in system settings.';
          _capturingGps = false;
        });
        await openAppSettings();
        return;
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      if (!mounted) return;
      setState(() {
        _gps = GeoPoint(latitude: position.latitude, longitude: position.longitude, timestamp: position.timestamp);
        _gpsAt = position.timestamp;
        _capturingGps = false;
      });
      await _saveProgress();
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not capture GPS: $err';
        _capturingGps = false;
      });
    }
  }

  Future<bool> _saveProgress() async {
    if (_detail.isLocked) return true;
    try {
      final updated = await widget.auth.api.updateInspection(
        _detail.id,
        remarks: _remarks.text.trim().isEmpty ? null : _remarks.text.trim(),
        locationMismatch: _locationMismatch,
        latitude: _gps?.latitude,
        longitude: _gps?.longitude,
        checklist: Map<String, bool>.from(_checklist),
      );
      if (!mounted) return true;
      _applyDetail(updated);
      return true;
    } on ApiException catch (err) {
      if (!mounted) return false;
      setState(() => _error = err.message);
      return false;
    } catch (_) {
      if (!mounted) return false;
      setState(() => _error = 'Could not save inspection notes to the API.');
      return false;
    }
  }

  Future<void> _addMeasurement() async {
    if (_testLoadValue == null) {
      setState(() => _error = 'Enter a test load');
      return;
    }
    if (_observedValue == null) {
      setState(() => _error = 'Enter the observed reading');
      return;
    }
    setState(() {
      _addingMeasurement = true;
      _error = null;
    });
    try {
      await _saveProgress();
      final updated = await widget.auth.api.addMeasurement(
        _detail.id,
        capacity: _capacity,
        testLoad: _testLoadValue!,
        observedValue: _observedValue!,
        permissibleError: _tolerance,
      );
      if (!mounted) return;
      _testLoad.clear();
      _observed.clear();
      setState(() => _addingMeasurement = false);
      _applyDetail(updated);
    } on ApiException catch (err) {
      if (!mounted) return;
      setState(() {
        _error = err.message;
        _addingMeasurement = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not save the measurement';
        _addingMeasurement = false;
      });
    }
  }

  String? _stepProblem() {
    switch (_step) {
      case 0:
        if (_gps == null) return 'Capture GPS before continuing';
        return null;
      case 1:
        if (_detail.measurements.isEmpty) return 'Record at least one measurement';
        return null;
      case 2:
        if (_pendingPhoto != null) return 'Attach or remove the photo before continuing';
        if (_detail.photos.isEmpty) return 'Capture and attach at least one evidence photo';
        return null;
      case 3:
        if (_result == 'FAIL' && _remarks.text.trim().isEmpty) {
          return 'Enter remarks explaining the FAIL result';
        }
        return null;
      default:
        return null;
    }
  }

  Future<void> _next() async {
    final problem = _stepProblem();
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    setState(() => _error = null);
    final saved = await _saveProgress();
    if (!saved) return;
    setState(() => _step = (_step + 1).clamp(0, 4));
  }

  Future<void> _submit() async {
    for (var i = 0; i <= 3; i++) {
      _step = i;
      final problem = _stepProblem();
      if (problem != null) {
        setState(() => _error = problem);
        return;
      }
    }
    setState(() {
      _saving = true;
      _error = null;
      _step = 4;
    });
    try {
      final saved = await _saveProgress();
      if (!saved) {
        setState(() => _saving = false);
        return;
      }
      final completed = await widget.auth.api.completeInspection(
        _detail.id,
        result: _result,
        remarks: _remarks.text.trim().isEmpty ? null : _remarks.text.trim(),
      );
      if (!mounted) return;
      _applyDetail(completed);
      setState(() => _saving = false);
      final passNote = _result == 'PASS'
          ? 'PASS recorded. Generate the digital certificate from the web portal — this app does not issue certificates.'
          : 'Inspection submitted ($_result).';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(passNote)));
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

  bool get _locked => _detail.isLocked;

  @override
  Widget build(BuildContext context) {
    final job = widget.job;
    final errorValue = _liveError;

    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        title: Text(job.applicationNumber.isEmpty ? 'Inspection' : job.applicationNumber),
      ),
      body: Column(
        children: [
          if (_error != null)
            Material(
              color: const Color(0xFFFEE2E2),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Expanded(child: Text(_error!, style: const TextStyle(color: Color(0xFF991B1B), fontSize: 15))),
                    IconButton(
                      onPressed: () => setState(() => _error = null),
                      icon: const Icon(Icons.close, color: Color(0xFF991B1B)),
                    ),
                  ],
                ),
              ),
            ),
          Expanded(
            child: Stepper(
              currentStep: _step,
              onStepTapped: _locked ? null : (index) => setState(() => _step = index),
              controlsBuilder: (context, details) {
                if (_locked) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(top: 16),
                  child: Row(
                    children: [
                      if (_step < 4 && !_locked)
                        FilledButton(
                          onPressed: _saving ? null : _next,
                          child: const Text('Continue'),
                        ),
                      if (_step == 4 && !_locked)
                        FilledButton(
                          onPressed: _saving ? null : _submit,
                          child: Text(_saving ? 'Submitting…' : 'Submit inspection'),
                        ),
                      if (_step > 0) ...[
                        const SizedBox(width: 8),
                        OutlinedButton(
                          onPressed: () => setState(() => _step -= 1),
                          child: const Text('Back'),
                        ),
                      ],
                    ],
                  ),
                );
              },
              steps: [
                Step(
                  title: const Text('GPS verification'),
                  isActive: _step >= 0,
                  state: _gps == null ? StepState.indexed : StepState.complete,
                  content: _gpsStep(),
                ),
                Step(
                  title: const Text('Measurement entry'),
                  isActive: _step >= 1,
                  content: _measurementStep(errorValue),
                ),
                Step(
                  title: const Text('Capture evidence'),
                  isActive: _step >= 2,
                  content: _photoStep(),
                ),
                Step(
                  title: const Text('Remarks and result'),
                  isActive: _step >= 3,
                  content: _resultStep(),
                ),
                Step(
                  title: const Text('Review and submit'),
                  isActive: _step >= 4,
                  content: _reviewStep(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _gpsStep() {
    final distance = _distanceMetres;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _kv('Registered coordinates', _coords(_detail.instrumentLat, _detail.instrumentLng)),
        if (_gps == null)
          const Text('No field location captured yet', style: TextStyle(fontSize: 16))
        else ...[
          Text('Field latitude: ${_gps!.latitude.toStringAsFixed(6)}', style: const TextStyle(fontSize: 16)),
          Text('Field longitude: ${_gps!.longitude.toStringAsFixed(6)}', style: const TextStyle(fontSize: 16)),
          Text('Captured at: ${formatDateTime(_gpsAt)}', style: const TextStyle(fontSize: 16)),
          if (distance != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'Approximate distance from registered location: ${distance.round()} m. The API stores coordinates and a location-mismatch flag; it does not apply a distance threshold.',
                style: const TextStyle(fontSize: 14, color: Color(0xFF475569)),
              ),
            ),
        ],
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: _locationMismatch,
          onChanged: _locked ? null : (value) => setState(() => _locationMismatch = value),
          title: const Text('Location mismatch observed'),
          subtitle: const Text('Same flag used on the web inspection form'),
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 52,
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: _locked || _capturingGps ? null : _captureGps,
            icon: const Icon(Icons.my_location),
            label: Text(_capturingGps ? 'Capturing…' : 'Capture current GPS'),
          ),
        ),
      ],
    );
  }

  Widget _measurementStep(double? errorValue) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Instrument type configuration (not a legal MPE table): ±$_tolerance $_unit'.trim(),
          style: const TextStyle(fontSize: 14, color: Color(0xFF475569)),
        ),
        const SizedBox(height: 8),
        const Text(
          'Error = observed reading − test load. Enter the values from the instrument under test.',
          style: TextStyle(fontSize: 14, color: Color(0xFF475569)),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _testLoad,
          enabled: !_locked,
          keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
          decoration: InputDecoration(labelText: 'Test load ${_unit.isEmpty ? '' : '($_unit)'}'.trim(), border: const OutlineInputBorder()),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _observed,
          enabled: !_locked,
          keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
          decoration: InputDecoration(labelText: 'Observed reading ${_unit.isEmpty ? '' : '($_unit)'}'.trim(), border: const OutlineInputBorder()),
        ),
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: const Color(0xFFE0F2FE), borderRadius: BorderRadius.circular(12)),
          child: Text(
            errorValue == null
                ? 'Enter test load and observed reading to calculate error'
                : 'Error = ${errorValue >= 0 ? '+' : ''}${errorValue.toStringAsFixed(4)} $_unit'.trim(),
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: _navy),
          ),
        ),
        if (errorValue != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              withinPrototypeTolerance(errorValue, _tolerance)
                  ? 'Within configured prototype tolerance (officer still chooses PASS or FAIL)'
                  : 'Outside configured prototype tolerance (officer still chooses PASS or FAIL)',
              style: TextStyle(
                fontSize: 15,
                color: withinPrototypeTolerance(errorValue, _tolerance) ? const Color(0xFF166534) : const Color(0xFF9A3412),
              ),
            ),
          ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          height: 48,
          child: FilledButton.tonal(
            onPressed: _locked || _addingMeasurement ? null : _addMeasurement,
            child: Text(_addingMeasurement ? 'Saving…' : 'Add measurement'),
          ),
        ),
        const SizedBox(height: 12),
        for (final row in _detail.measurements)
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text('Test ${row.testLoad} → observed ${row.observedValue}'),
            subtitle: Text('Error ${row.error} · limit ${row.permissibleError} · ${row.result}'),
          ),
        const Divider(),
        const Text('Checklist', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        for (final entry in _checklistLabels.entries)
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: _checklist[entry.key] ?? false,
            onChanged: _locked ? null : (value) => setState(() => _checklist[entry.key] = value),
            title: Text(entry.value),
          ),
      ],
    );
  }

  Widget _photoStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DropdownButtonFormField<String>(
          key: ValueKey(_photoKind),
          initialValue: _photoKind,
          decoration: const InputDecoration(labelText: 'Evidence type', border: OutlineInputBorder()),
          items: [
            for (final entry in _photoKinds.entries)
              DropdownMenuItem(value: entry.key, child: Text(entry.value)),
          ],
          onChanged: _locked ? null : (value) => setState(() => _photoKind = value ?? _photoKind),
        ),
        const SizedBox(height: 12),
        if (_pendingPhoto != null) ...[
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.memory(_pendingPhoto!, height: 220, fit: BoxFit.cover),
          ),
          const SizedBox(height: 8),
          const Text('Preview — attach to upload through the existing inspection photo API'),
        ] else if (_detail.photos.isNotEmpty)
          Text('${_detail.photos.length} photo(s) attached', style: const TextStyle(fontSize: 16)),
        for (final photo in _detail.photos)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.image_outlined),
            title: Text(photo.filename),
            subtitle: Text('${_photoKinds[photo.kind] ?? photo.kind} · ${formatDateTime(photo.capturedAt)}'),
          ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            FilledButton.icon(
              onPressed: _locked ? null : _takePhoto,
              icon: const Icon(Icons.photo_camera),
              label: Text(_pendingPhoto == null ? 'Capture photo' : 'Retake'),
            ),
            if (_pendingPhoto != null)
              OutlinedButton(
                onPressed: _locked ? null : () => setState(() => _pendingPhoto = null),
                child: const Text('Remove'),
              ),
            if (_pendingPhoto != null)
              FilledButton.tonal(
                onPressed: _locked || _uploadingPhoto ? null : _uploadPhoto,
                child: Text(_uploadingPhoto ? 'Uploading…' : 'Attach evidence'),
              ),
          ],
        ),
      ],
    );
  }

  Widget _resultStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: _remarks,
          enabled: !_locked,
          maxLines: 4,
          decoration: InputDecoration(
            labelText: _result == 'FAIL' ? 'Remarks (required for FAIL)' : 'Remarks',
            border: const OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 16),
        const Text('Result', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        for (final value in const ['PASS', 'FAIL'])
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: _result == value
                      ? (value == 'FAIL' ? const Color(0xFFB91C1C) : const Color(0xFF166534))
                      : Colors.white,
                  foregroundColor: _result == value ? Colors.white : _navy,
                  side: BorderSide(color: value == 'FAIL' ? const Color(0xFFB91C1C) : const Color(0xFF166534)),
                ),
                onPressed: _locked ? null : () => setState(() => _result = value),
                child: Text(value),
              ),
            ),
          ),
        TextButton(
          onPressed: _locked ? null : () => setState(() => _result = 'REQUIRES_REVIEW'),
          child: Text(
            _result == 'REQUIRES_REVIEW' ? 'Selected: requires review' : 'Submit for review instead',
          ),
        ),
      ],
    );
  }

  Widget _reviewStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _kv('Application', _detail.applicationNumber ?? widget.job.applicationNumber),
        _kv('Owner / business', [_detail.ownerName ?? widget.job.ownerName, _detail.businessName ?? widget.job.businessName].whereType<String>().where((s) => s.isNotEmpty).join(' · ')),
        _kv('Instrument', '${_detail.manufacturer ?? widget.job.manufacturer ?? '—'} / ${_detail.model ?? widget.job.model ?? '—'}'),
        _kv('Serial', _detail.serialNumber ?? widget.job.serialNumber ?? '—'),
        _kv('GPS', _gps == null ? 'Not captured' : '${_gps!.latitude.toStringAsFixed(6)}, ${_gps!.longitude.toStringAsFixed(6)}'),
        _kv('Location mismatch flag', _locationMismatch ? 'Yes' : 'No'),
        _kv('Measurements', '${_detail.measurements.length} recorded'),
        _kv('Evidence photos', '${_detail.photos.length} attached'),
        _kv('Result', _result),
        _kv('Remarks', _remarks.text.trim().isEmpty ? '—' : _remarks.text.trim()),
        if (_locked) const Text('This inspection is already submitted.', style: TextStyle(fontSize: 16)),
        if (!_locked && _result == 'PASS')
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text(
              'PASS uses the existing completion API. Certificate generation remains on the web portal.',
              style: TextStyle(fontSize: 14, color: Color(0xFF475569)),
            ),
          ),
      ],
    );
  }

  String _coords(double? lat, double? lng) {
    if (lat == null || lng == null) return 'Not registered';
    return '${lat.toStringAsFixed(6)}, ${lng.toStringAsFixed(6)}';
  }

  Widget _kv(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 13, color: Color(0xFF64748B))),
          Text(value.isEmpty ? '—' : value, style: const TextStyle(fontSize: 16)),
        ],
      ),
    );
  }
}
