import 'models.dart';

abstract class PhotoStore {
  Future<String> persist({
    required String officerId,
    required String draftId,
    required List<int> bytes,
    required String filename,
  });

  Future<List<int>> read(String path);

  Future<void> delete(String path);
}

class MemoryPhotoStore implements PhotoStore {
  final files = <String, List<int>>{};

  @override
  Future<String> persist({
    required String officerId,
    required String draftId,
    required List<int> bytes,
    required String filename,
  }) async {
    final path = 'mem://$officerId/$draftId/${newLocalId()}-$filename';
    files[path] = List<int>.from(bytes);
    return path;
  }

  @override
  Future<List<int>> read(String path) async => files[path] ?? <int>[];

  @override
  Future<void> delete(String path) async {
    files.remove(path);
  }
}
