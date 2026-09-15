import 'dart:math';

import '../api/models.dart';

/// Approximate great-circle distance in metres.
double distanceMetres(GeoPoint a, GeoPoint b) {
  const earth = 6371000.0;
  final dLat = _rad(b.latitude - a.latitude);
  final dLng = _rad(b.longitude - a.longitude);
  final lat1 = _rad(a.latitude);
  final lat2 = _rad(b.latitude);
  final h = sin(dLat / 2) * sin(dLat / 2) + cos(lat1) * cos(lat2) * sin(dLng / 2) * sin(dLng / 2);
  return 2 * earth * asin(min(1, sqrt(h)));
}

double _rad(double degrees) => degrees * pi / 180;

/// Prototype field warning: more than 250 m from the registered instrument coordinates.
const mismatchThresholdMetres = 250.0;
