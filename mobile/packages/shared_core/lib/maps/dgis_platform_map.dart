import 'package:dgis_mobile_sdk_map/dgis.dart' as sdk;
import 'package:equatable/equatable.dart';
import 'package:flutter/material.dart';

import 'dgis_session.dart';
import 'map_provider.dart';

/// Кружок под точку на карте (пода / назначения и т.п.).
class DgisCircleSpot extends Equatable {
  const DgisCircleSpot({
    required this.latitude,
    required this.longitude,
    required this.fillArgb,
    this.radiusMeters = 45,
  });

  final double latitude;
  final double longitude;
  final int fillArgb;
  final double radiusMeters;

  @override
  List<Object?> get props => [latitude, longitude, fillArgb, radiusMeters];
}

/// Запрос камеры и примитивов для [DgisPlatformMap].
///
/// Колбэк [onMapTap] намеренно не участвует в [props] ([Equatable]), чтобы сцены
/// с теми же координатами оставались равными.
class DgisMapScene extends Equatable {
  const DgisMapScene({
    required this.cameraLatitude,
    required this.cameraLongitude,
    this.cameraZoom = 14,
    this.circles = const [],
    this.routeLineArgb = 0xFF2196F3,
    this.routeLineWidthDp = 4,
    this.routePoints = const [],
    this.myLocationEnabled = false,
    this.myLocationHeadingFromSatellite = true,
    this.onMapTap,
  });

  final double cameraLatitude;
  final double cameraLongitude;
  final double cameraZoom;
  final List<DgisCircleSpot> circles;
  final List<MapLatLng> routePoints;

  /// ARGB, например `0xFF2196F3`.
  final int routeLineArgb;
  final double routeLineWidthDp;
  final bool myLocationEnabled;
  final bool myLocationHeadingFromSatellite;
  final void Function(MapLatLng coordinate)? onMapTap;

  @override
  List<Object?> get props => [
        cameraLatitude,
        cameraLongitude,
        cameraZoom,
        circles,
        routeLineArgb,
        routeLineWidthDp,
        routePoints,
        myLocationEnabled,
        myLocationHeadingFromSatellite,
      ];
}

/// Карта 2GIS; [session] — результат [DgisSession.tryInitialize].
class DgisPlatformMap extends StatefulWidget {
  const DgisPlatformMap({
    super.key,
    required this.session,
    required this.scene,
  });

  final DgisSession session;
  final DgisMapScene scene;

  @override
  State<DgisPlatformMap> createState() => _DgisPlatformMapState();
}

class _MapTapRelay extends sdk.TouchEventsObserver {
  sdk.Map? map;
  void Function(MapLatLng coordinate)? coordinateTapCallback;

  @override
  void onTap(sdk.ScreenPoint point) {
    final m = map;
    final cb = coordinateTapCallback;
    if (m == null || cb == null) return;
    final geo = m.camera.projection.screenToMap(point);
    if (geo == null) return;
    cb(MapLatLng(geo.latitude.value, geo.longitude.value));
  }
}

class _DgisPlatformMapState extends State<DgisPlatformMap> {
  final sdk.MapWidgetController _controller = sdk.MapWidgetController();
  final _MapTapRelay _tapRelay = _MapTapRelay();

  sdk.MapObjectManager? _objectManager;
  sdk.Map? _map;

  bool _didAddMyLocationSource = false;
  bool _appliedInitialCamera = false;

  static sdk.CameraPosition _cameraFromScene(DgisMapScene s) {
    return sdk.CameraPosition(
      point: sdk.GeoPoint(
        latitude: sdk.Latitude(s.cameraLatitude),
        longitude: sdk.Longitude(s.cameraLongitude),
      ),
      zoom: sdk.Zoom(s.cameraZoom),
    );
  }

  @override
  void initState() {
    super.initState();
    _controller.copyrightAlignment = Alignment.bottomLeft;
    _tapRelay.map = null;
    _tapRelay.coordinateTapCallback = widget.scene.onMapTap;

    void onReady(sdk.Map map) {
      if (!mounted) return;
      setState(() {
        _map = map;
        _objectManager = sdk.MapObjectManager(map);
        _tapRelay.map = map;
      });

      final wantsTap = widget.scene.onMapTap != null;
      _controller.setTouchEventsObserver(wantsTap ? _tapRelay : null);

      _maybeAddMyLocation(widget.scene.myLocationEnabled, widget.scene.myLocationHeadingFromSatellite);
      _moveCamera(widget.scene);
      _appliedInitialCamera = true;
      _syncDrawing(widget.scene);
    }

    _controller.getMapAsync(onReady);
  }

  void _maybeAddMyLocation(bool enabled, bool headingSatellite) {
    final map = _map;
    if (map == null || !enabled || _didAddMyLocationSource) return;
    final bearing = headingSatellite
        ? sdk.BearingSource.satellite
        : sdk.BearingSource.magnetic;
    final settings =
        sdk.MyLocationControllerSettings(bearingSource: bearing);
    map.addSource(
      sdk.MyLocationMapObjectSource(
        widget.session.nativeContext,
        settings,
      ),
    );
    _didAddMyLocationSource = true;
  }

  void _moveCamera(DgisMapScene scene) {
    final map = _map;
    if (map == null) return;
    final target = _cameraFromScene(scene);
    map.camera.moveToCameraPosition(
      target,
      const Duration(milliseconds: 400),
      sdk.CameraAnimationType.default_,
    );
  }

  void _syncDrawing(DgisMapScene scene) {
    final manager = _objectManager;
    if (manager == null) return;

    manager.removeAll();

    for (final c in scene.circles) {
      manager.addObject(
        sdk.Circle(
          sdk.CircleOptions(
            position: sdk.GeoPoint(
              latitude: sdk.Latitude(c.latitude),
              longitude: sdk.Longitude(c.longitude),
            ),
            radius: sdk.Meter(c.radiusMeters),
            color: sdk.Color(c.fillArgb),
            strokeWidth: const sdk.LogicalPixel(2),
            strokeColor: const sdk.Color(0xFFFFFFFF),
            userData: 'circle',
          ),
        ),
      );
    }

    if (scene.routePoints.length >= 2) {
      final pts = scene.routePoints
          .map(
            (p) => sdk.GeoPoint(
              latitude: sdk.Latitude(p.latitude),
              longitude: sdk.Longitude(p.longitude),
            ),
          )
          .toList(growable: false);
      manager.addObject(
        sdk.Polyline(
          sdk.PolylineOptions(
            points: pts,
            width: sdk.LogicalPixel(scene.routeLineWidthDp),
            color: sdk.Color(scene.routeLineArgb),
            userData: 'route',
          ),
        ),
      );
    }
  }

  @override
  void didUpdateWidget(covariant DgisPlatformMap oldWidget) {
    super.didUpdateWidget(oldWidget);

    final next = widget.scene;
    final old = oldWidget.scene;

    _tapRelay.coordinateTapCallback = next.onMapTap;
    _controller.setTouchEventsObserver(next.onMapTap != null ? _tapRelay : null);

    if (next.myLocationEnabled && !_didAddMyLocationSource) {
      _maybeAddMyLocation(next.myLocationEnabled, next.myLocationHeadingFromSatellite);
    }

    if (_map == null || !_appliedInitialCamera) return;

    if (next.cameraLatitude != old.cameraLatitude ||
        next.cameraLongitude != old.cameraLongitude ||
        next.cameraZoom != old.cameraZoom) {
      _moveCamera(next);
    }

    if (next != old) {
      _syncDrawing(next);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final options = sdk.MapOptions(
      position: _cameraFromScene(widget.scene),
      appearance: const sdk.AutomaticAppearance(
        sdk.MapTheme.defaultDayTheme(),
        sdk.MapTheme.defaultNightTheme(),
      ),
    );

    return sdk.MapWidget(
      sdkContext: widget.session.nativeContext,
      controller: _controller,
      mapOptions: options,
    );
  }
}
