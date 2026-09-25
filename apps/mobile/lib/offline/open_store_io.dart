import 'models.dart';
import 'sqlite_store.dart';

export 'models.dart';

Future<OfflineStore> openOfflineStore() => SqliteOfflineStore.open();
