import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';
import 'models.dart';

export 'models.dart';

class ApiException implements Exception {
  ApiException(this.message, [this.statusCode]);

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class AuthUser {
  const AuthUser({
    required this.id,
    required this.email,
    required this.fullName,
    required this.roles,
    this.phone,
  });

  final String id;
  final String email;
  final String fullName;
  final List<String> roles;
  final String? phone;

  bool get isLmo => roles.contains('LMO');
  bool get isGatc => roles.contains('GATC');
  bool get isFieldOfficer => isLmo || isGatc;
  bool get isAdmin => roles.contains('ADMIN');
  bool get isOwner => roles.contains('OWNER');

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id'] as String,
      email: json['email'] as String,
      fullName: json['fullName'] as String,
      roles: (json['roles'] as List<dynamic>).map((item) => item.toString()).toList(),
      phone: json['phone'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'fullName': fullName,
        'roles': roles,
        'phone': phone,
      };
}

class LoginResult {
  const LoginResult({required this.token, required this.user});

  final String token;
  final AuthUser user;
}

class OfficerDashboard {
  const OfficerDashboard({
    required this.assignedCount,
    required this.upcoming,
    required this.completed,
    this.jobs = const [],
  });

  final int assignedCount;
  final int upcoming;
  final int completed;
  final List<AssignedJob> jobs;

  int get assigned => assignedCount;

  factory OfficerDashboard.fromJson(Map<String, dynamic> json) {
    final summary = json['summary'] as Map<String, dynamic>? ?? {};
    final jobs = ((json['assigned'] as List<dynamic>?) ?? [])
        .whereType<Map<String, dynamic>>()
        .map(AssignedJob.fromJson)
        .toList();
    return OfficerDashboard(
      assignedCount: (summary['assigned'] as num?)?.toInt() ?? jobs.length,
      upcoming: (summary['upcoming'] as num?)?.toInt() ?? 0,
      completed: (summary['completed'] as num?)?.toInt() ?? 0,
      jobs: jobs,
    );
  }
}

class ApiClient {
  ApiClient({http.Client? httpClient, String? baseUrl})
      : _http = httpClient ?? http.Client(),
        _baseUrl = AppConfig.normalize(baseUrl ?? AppConfig.apiBaseUrl);

  final http.Client _http;
  String _baseUrl;
  String? _token;

  String get baseUrl => _baseUrl;

  void setBaseUrl(String url) {
    _baseUrl = AppConfig.normalize(url);
  }

  void setToken(String? token) {
    _token = token;
  }

  Map<String, String> _headers({bool jsonBody = true}) {
    final headers = <String, String>{};
    if (jsonBody) headers['Content-Type'] = 'application/json';
    if (_token != null && _token!.isNotEmpty) {
      headers['Authorization'] = 'Bearer $_token';
    }
    return headers;
  }

  Future<Map<String, dynamic>> _readJson(http.Response response) async {
    final decoded = jsonDecode(response.body.isEmpty ? '{}' : response.body);
    final data = decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        data['error'] as String? ?? 'Request failed (${response.statusCode})',
        response.statusCode,
      );
    }
    return data;
  }

  Future<LoginResult> login({required String email, required String password}) async {
    final response = await _http.post(
      Uri.parse('$baseUrl/api/auth/login'),
      headers: _headers(),
      body: jsonEncode({'email': email.trim(), 'password': password}),
    );
    final data = await _readJson(response);
    final token = data['token'] as String?;
    final userJson = data['user'] as Map<String, dynamic>?;
    if (token == null || userJson == null) {
      throw ApiException('Login response was missing a token');
    }
    _token = token;
    return LoginResult(token: token, user: AuthUser.fromJson(userJson));
  }

  Future<AuthUser> currentUser() async {
    final response = await _http.get(
      Uri.parse('$baseUrl/api/users/me'),
      headers: _headers(jsonBody: false),
    );
    return AuthUser.fromJson(await _readJson(response));
  }

  Future<OfficerDashboard> officerDashboard() async {
    final response = await _http.get(
      Uri.parse('$baseUrl/api/dashboard/officer'),
      headers: _headers(jsonBody: false),
    );
    return OfficerDashboard.fromJson(await _readJson(response));
  }

  Future<List<InspectionDetail>> listInspections() async {
    final response = await _http.get(
      Uri.parse('$baseUrl/api/inspections'),
      headers: _headers(jsonBody: false),
    );
    final decoded = jsonDecode(response.body.isEmpty ? '[]' : response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final data = decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
      throw ApiException(data['error'] as String? ?? 'Request failed (${response.statusCode})', response.statusCode);
    }
    return (decoded as List<dynamic>).whereType<Map<String, dynamic>>().map(InspectionDetail.fromJson).toList();
  }

  Future<InspectionDetail> getInspection(String id) async {
    final response = await _http.get(
      Uri.parse('$baseUrl/api/inspections/$id'),
      headers: _headers(jsonBody: false),
    );
    return InspectionDetail.fromJson(await _readJson(response));
  }

  Future<InspectionDetail> startInspection(String applicationId) async {
    final response = await _http.post(
      Uri.parse('$baseUrl/api/inspections'),
      headers: _headers(),
      body: jsonEncode({'applicationId': applicationId}),
    );
    return InspectionDetail.fromJson(await _readJson(response));
  }

  Future<InspectionDetail> updateInspection(
    String id, {
    String? remarks,
    bool? locationMismatch,
    double? latitude,
    double? longitude,
    Map<String, bool>? checklist,
  }) async {
    final body = <String, dynamic>{};
    if (remarks != null) body['remarks'] = remarks;
    if (locationMismatch != null) body['locationMismatch'] = locationMismatch;
    if (latitude != null) body['latitude'] = latitude;
    if (longitude != null) body['longitude'] = longitude;
    if (checklist != null) body['checklist'] = checklist;
    final response = await _http.put(
      Uri.parse('$baseUrl/api/inspections/$id'),
      headers: _headers(),
      body: jsonEncode(body),
    );
    return InspectionDetail.fromJson(await _readJson(response));
  }

  Future<InspectionDetail> addMeasurement(
    String id, {
    required double capacity,
    required double testLoad,
    required double observedValue,
    required double permissibleError,
  }) async {
    final response = await _http.post(
      Uri.parse('$baseUrl/api/inspections/$id/measurements'),
      headers: _headers(),
      body: jsonEncode({
        'capacity': capacity,
        'testLoad': testLoad,
        'observedValue': observedValue,
        'permissibleError': permissibleError,
      }),
    );
    return InspectionDetail.fromJson(await _readJson(response));
  }

  Future<InspectionDetail> uploadPhoto(
    String id, {
    required List<int> bytes,
    required String filename,
    String kind = 'INSTRUMENT_FRONT',
    double? latitude,
    double? longitude,
  }) async {
    final request = http.MultipartRequest('POST', Uri.parse('$baseUrl/api/inspections/$id/photos'));
    if (_token != null) request.headers['Authorization'] = 'Bearer $_token';
    request.fields['kind'] = kind;
    if (latitude != null) request.fields['latitude'] = latitude.toString();
    if (longitude != null) request.fields['longitude'] = longitude.toString();
    request.files.add(http.MultipartFile.fromBytes('file', bytes, filename: filename));
    final streamed = await _http.send(request);
    final response = await http.Response.fromStream(streamed);
    return InspectionDetail.fromJson(await _readJson(response));
  }

  Future<InspectionDetail> completeInspection(
    String id, {
    required String result,
    String? remarks,
  }) async {
    final response = await _http.post(
      Uri.parse('$baseUrl/api/inspections/$id/complete'),
      headers: _headers(),
      body: jsonEncode({'result': result, 'remarks': remarks}),
    );
    return InspectionDetail.fromJson(await _readJson(response));
  }
}
