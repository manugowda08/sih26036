import 'package:flutter/foundation.dart';

import '../api/api_client.dart';

/// Interface availability is not trusted on its own. ONLINE/OFFLINE in the UI
/// is driven by whether the LM Smart API actually responds.
class ConnectivityMonitor extends ChangeNotifier {
  bool apiReachable = false;

  Future<void> start() async {}

  Future<bool> refreshApi(ApiClient api) async {
    apiReachable = await api.ping();
    notifyListeners();
    return apiReachable;
  }
}
