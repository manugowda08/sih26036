import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'models.dart';
import 'photo_store.dart';

class DirectoryPhotoStore implements PhotoStore {
  DirectoryPhotoStore({this.rootOverride});

  final Directory? rootOverride;

  Future<Directory> _root() async {
    if (rootOverride != null) return rootOverride!;
    final docs = await getApplicationDocumentsDirectory();
    return Directory(p.join(docs.path, 'lm_smart_evidence'));
  }

  @override
  Future<String> persist({
    required String officerId,
    required String draftId,
    required List<int> bytes,
    required String filename,
  }) async {
    final dir = Directory(p.join((await _root()).path, officerId, draftId));
    await dir.create(recursive: true);
    final safe = filename.replaceAll(RegExp(r'[^\w.\-]+'), '_');
    final name = '${newLocalId()}-$safe';
    final file = File(p.join(dir.path, name));
    await file.writeAsBytes(Uint8List.fromList(bytes), flush: true);
    return file.path;
  }

  @override
  Future<List<int>> read(String path) => File(path).readAsBytes();

  @override
  Future<void> delete(String path) async {
    final file = File(path);
    if (await file.exists()) await file.delete();
  }
}
