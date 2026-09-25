import 'package:flutter/material.dart';

import 'app.dart';
import 'auth/auth_controller.dart';
import 'offline/offline_controller.dart';
import 'offline/open_store.dart';
import 'offline/directory_photo_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  OfflineStore store;
  try {
    store = await openOfflineStore();
  } catch (_) {
    store = MemoryOfflineStore();
  }
  final offline = OfflineController(store: store, photos: DirectoryPhotoStore());
  await offline.start();
  final auth = AuthController();
  await auth.restore();
  runApp(LmSmartApp(auth: auth, offline: offline));
}
