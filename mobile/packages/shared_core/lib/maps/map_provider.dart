import 'package:flutter/widgets.dart';

class MapMarker {
  const MapMarker({
    required this.id,
    required this.latitude,
    required this.longitude,
    this.title,
    this.color,
    this.icon,
  });

  final String id;
  final double latitude;
  final double longitude;
  final String? title;
  final Color? color;
  final String? icon;
}

class MapRoute {
  const MapRoute({
    required this.points,
    this.color,
    this.width = 4.0,
  });

  final List<MapLatLng> points;
  final Color? color;
  final double width;
}

class MapLatLng {
  const MapLatLng(this.latitude, this.longitude);

  final double latitude;
  final double longitude;
}

class MapCameraPosition {
  const MapCameraPosition({
    required this.latitude,
    required this.longitude,
    this.zoom = 14.0,
  });

  final double latitude;
  final double longitude;
  final double zoom;
}

abstract class MapProvider {
  Widget buildMap({
    required MapCameraPosition initialPosition,
    List<MapMarker> markers = const [],
    List<MapRoute> routes = const [],
    void Function(MapLatLng)? onTap,
    void Function(MapCameraPosition)? onCameraMove,
    bool myLocationEnabled = false,
    bool myLocationButtonEnabled = false,
  });

  void moveCamera(MapCameraPosition position);
  void animateCamera(MapCameraPosition position, {Duration? duration});
  void fitBounds(MapLatLng southwest, MapLatLng northeast, {double padding = 50});

  void dispose();
}
