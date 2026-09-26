class GeoPoint {
  const GeoPoint({required this.latitude, required this.longitude, this.timestamp});

  final double latitude;
  final double longitude;
  final DateTime? timestamp;
}

class AssignedJob {
  const AssignedJob({
    required this.applicationId,
    required this.applicationNumber,
    required this.status,
    required this.kind,
    this.inspectionId,
    this.ownerName,
    this.businessName,
    this.instrumentType,
    this.manufacturer,
    this.model,
    this.serialNumber,
    this.locationText,
    this.scheduledAt,
    this.instrumentCode,
    this.capacity,
    this.unit,
    this.instrumentLat,
    this.instrumentLng,
  });

  final String applicationId;
  final String applicationNumber;
  final String status;
  final String kind;
  final String? inspectionId;
  final String? ownerName;
  final String? businessName;
  final String? instrumentType;
  final String? manufacturer;
  final String? model;
  final String? serialNumber;
  final String? locationText;
  final DateTime? scheduledAt;
  final String? instrumentCode;
  final String? capacity;
  final String? unit;
  final double? instrumentLat;
  final double? instrumentLng;

  factory AssignedJob.fromJson(Map<String, dynamic> json) {
    final instrument = json['instrument'] as Map<String, dynamic>?;
    final type = instrument?['type'] as Map<String, dynamic>?;
    final location = instrument?['location'] as Map<String, dynamic>?;
    final owner = json['owner'] as Map<String, dynamic>?;
    final business = json['business'] as Map<String, dynamic>?;
    final schedule = json['schedule'] as Map<String, dynamic>?;
    return AssignedJob(
      applicationId: json['id'] as String,
      applicationNumber: json['applicationNumber'] as String? ?? '',
      status: json['status'] as String? ?? '',
      kind: json['kind'] as String? ?? '',
      inspectionId: json['inspectionId'] as String?,
      ownerName: owner?['fullName'] as String?,
      businessName: business?['name'] as String?,
      instrumentType: type?['name'] as String?,
      manufacturer: instrument?['manufacturer'] as String?,
      model: instrument?['model'] as String?,
      serialNumber: instrument?['serialNumber'] as String?,
      instrumentCode: instrument?['instrumentCode'] as String?,
      capacity: instrument?['capacity']?.toString(),
      unit: type?['unit'] as String?,
      instrumentLat: _numOrNull(location?['latitude']),
      instrumentLng: _numOrNull(location?['longitude']),
      locationText: [
        location?['address'],
        location?['city'],
        location?['state'],
      ].whereType<String>().where((part) => part.trim().isNotEmpty).join(', '),
      scheduledAt: _parseDate(schedule?['scheduledAt']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': applicationId,
        'applicationNumber': applicationNumber,
        'status': status,
        'kind': kind,
        'inspectionId': inspectionId,
        'owner': {'fullName': ownerName},
        'business': {'name': businessName},
        'instrument': {
          'instrumentCode': instrumentCode,
          'manufacturer': manufacturer,
          'model': model,
          'serialNumber': serialNumber,
          'capacity': capacity,
          'type': {'name': instrumentType, 'unit': unit},
          'location': {
            'address': locationText,
            'latitude': instrumentLat,
            'longitude': instrumentLng,
          },
        },
        'schedule': {'scheduledAt': scheduledAt?.toIso8601String()},
      };
}

class InspectionPhoto {
  const InspectionPhoto({
    required this.id,
    required this.filename,
    required this.kind,
    this.capturedAt,
    this.localPath,
  });

  final String id;
  final String filename;
  final String kind;
  final DateTime? capturedAt;
  final String? localPath;

  factory InspectionPhoto.fromJson(Map<String, dynamic> json) {
    return InspectionPhoto(
      id: json['id'] as String,
      filename: json['filename'] as String? ?? '',
      kind: json['kind'] as String? ?? 'INSTRUMENT_FRONT',
      capturedAt: _parseDate(json['capturedAt']),
      localPath: json['localPath'] as String?,
    );
  }
}

class InspectionMeasurement {
  const InspectionMeasurement({
    required this.id,
    required this.testLoad,
    required this.observedValue,
    required this.error,
    required this.permissibleError,
    required this.result,
  });

  final String id;
  final double testLoad;
  final double observedValue;
  final double error;
  final double permissibleError;
  final String result;

  factory InspectionMeasurement.fromJson(Map<String, dynamic> json) {
    return InspectionMeasurement(
      id: json['id'] as String,
      testLoad: _num(json['testLoad']),
      observedValue: _num(json['observedValue']),
      error: _num(json['error']),
      permissibleError: _num(json['permissibleError']),
      result: json['result'] as String? ?? '',
    );
  }
}

class LocationEvidence {
  const LocationEvidence({
    required this.registeredLatitude,
    required this.registeredLongitude,
    required this.capturedLatitude,
    required this.capturedLongitude,
    required this.distanceMeters,
    required this.calculation,
    required this.advisory,
  });

  final double registeredLatitude;
  final double registeredLongitude;

  final double capturedLatitude;
  final double capturedLongitude;

  final double distanceMeters;
  final String calculation;
  final bool advisory;

  factory LocationEvidence.fromJson(Map<String, dynamic> json) {
    final registered =
        json['registered'] as Map<String, dynamic>? ?? {};

    final captured =
        json['captured'] as Map<String, dynamic>? ?? {};

    return LocationEvidence(
      registeredLatitude:
          (registered['latitude'] as num).toDouble(),
      registeredLongitude:
          (registered['longitude'] as num).toDouble(),
      capturedLatitude:
          (captured['latitude'] as num).toDouble(),
      capturedLongitude:
          (captured['longitude'] as num).toDouble(),
      distanceMeters:
          (json['distanceMeters'] as num).toDouble(),
      calculation:
          json['calculation'] as String? ?? 'POSTGIS',
      advisory:
          json['advisory'] == true,
    );
  }
}

class InspectionDetail {
  InspectionDetail({
    required this.id,
    this.result,
    this.remarks,
    this.locationMismatch = false,
    this.startedAt,
    this.submittedAt,
    this.applicationNumber,
    this.applicationId,
    this.applicationStatus,
    this.ownerName,
    this.businessName,
    this.scheduledAt,
    this.instrumentCode,
    this.instrumentType,
    this.manufacturer,
    this.model,
    this.serialNumber,
    this.capacity,
    this.unit,
    this.permissibleError = 0.5,
    this.instrumentLat,
    this.instrumentLng,
    this.locationText,
    this.fieldLat,
    this.fieldLng,
    this.locationEvidence,
    Map<String, bool>? checklist,
    List<InspectionMeasurement>? measurements,
    List<InspectionPhoto>? photos,
  })  : checklist = checklist ?? {},
        measurements = measurements ?? [],
        photos = photos ?? [];

  final String id;
  final String? result;
  final String? remarks;
  final bool locationMismatch;
  final DateTime? startedAt;
  final DateTime? submittedAt;
  final String? applicationNumber;
  final String? applicationId;
  final String? applicationStatus;
  final String? ownerName;
  final String? businessName;
  final DateTime? scheduledAt;
  final String? instrumentCode;
  final String? instrumentType;
  final String? manufacturer;
  final String? model;
  final String? serialNumber;
  final String? capacity;
  final String? unit;
  final double permissibleError;
  final double? instrumentLat;
  final double? instrumentLng;
  final String? locationText;
  final double? fieldLat;
  final double? fieldLng;
  final LocationEvidence? locationEvidence;
  final Map<String, bool> checklist;
  final List<InspectionMeasurement> measurements;
  final List<InspectionPhoto> photos;

  bool get isLocked => submittedAt != null;

  factory InspectionDetail.fromJson(Map<String, dynamic> json) {
    final application = json['application'] as Map<String, dynamic>?;
    final instrument = json['instrument'] as Map<String, dynamic>?;
    final type = instrument?['type'] as Map<String, dynamic>?;
    final instLoc = instrument?['location'] as Map<String, dynamic>?;
    final fieldLoc = json['location'] as Map<String, dynamic>?;
    final checklistRaw = json['checklist'] as Map<String, dynamic>? ?? {};
    final checklist = <String, bool>{};
    for (final entry in checklistRaw.entries) {
      if (entry.value is bool) checklist[entry.key] = entry.value as bool;
    }
    final locationEvidenceJson =
    json['locationEvidence'] as Map<String, dynamic>?;
    return InspectionDetail(
      id: json['id'] as String,
      result: json['result'] as String?,
      remarks: json['remarks'] as String?,
      locationEvidence: locationEvidenceJson == null
        ? null
        : LocationEvidence.fromJson(locationEvidenceJson),
      locationMismatch: json['locationMismatch'] == true,
      startedAt: _parseDate(json['startedAt']),
      submittedAt: _parseDate(json['submittedAt']),
      applicationNumber: application?['applicationNumber'] as String?,
      applicationId: application?['id'] as String?,
      applicationStatus: application?['status'] as String?,
      ownerName: (application?['owner'] as Map<String, dynamic>?)?['fullName'] as String?,
      businessName: (application?['business'] as Map<String, dynamic>?)?['name'] as String? ??
          (instrument?['business'] as Map<String, dynamic>?)?['name'] as String?,
      scheduledAt: _parseDate((application?['schedule'] as Map<String, dynamic>?)?['scheduledAt']),
      instrumentCode: instrument?['instrumentCode'] as String?,
      instrumentType: type?['name'] as String?,
      manufacturer: instrument?['manufacturer'] as String?,
      model: instrument?['model'] as String?,
      serialNumber: instrument?['serialNumber'] as String?,
      capacity: instrument?['capacity']?.toString(),
      unit: type?['unit'] as String?,
      permissibleError: _num(type?['defaultPermissibleError'], fallback: 0.5),
      instrumentLat: _numOrNull(instLoc?['latitude']),
      instrumentLng: _numOrNull(instLoc?['longitude']),
      locationText: [
        instLoc?['address'],
        instLoc?['city'],
        instLoc?['state'],
      ].whereType<String>().where((part) => part.trim().isNotEmpty).join(', '),
      fieldLat: _numOrNull(fieldLoc?['latitude']),
      fieldLng: _numOrNull(fieldLoc?['longitude']),
      checklist: checklist,
      measurements: ((json['measurements'] as List<dynamic>?) ?? [])
          .whereType<Map<String, dynamic>>()
          .map(InspectionMeasurement.fromJson)
          .toList(),
      photos: ((json['photos'] as List<dynamic>?) ?? [])
          .whereType<Map<String, dynamic>>()
          .map(InspectionPhoto.fromJson)
          .toList(),
      
    );
  }
}

DateTime? _parseDate(dynamic value) {
  if (value == null) return null;
  return DateTime.tryParse(value.toString());
}

double _num(dynamic value, {double fallback = 0}) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? fallback;
}

double? _numOrNull(dynamic value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString());
}
