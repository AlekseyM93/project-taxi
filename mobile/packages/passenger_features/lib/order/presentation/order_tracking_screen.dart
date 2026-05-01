import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_core/shared_core.dart';

import '../../home/domain/passenger_order_repository.dart';

/// Экран отслеживания заказа: карта + websocket + периодический poll деталей.
class OrderTrackingScreen extends StatefulWidget {
  const OrderTrackingScreen({
    super.key,
    required this.orderId,
    required this.orderRepository,
    this.dgisSession,
    this.passengerRealtime,
    this.initialSnapshot,
  });

  final String orderId;
  final PassengerOrderRepository orderRepository;
  final DgisSession? dgisSession;
  final PassengerRealtimeService? passengerRealtime;
  final OrderDetails? initialSnapshot;

  @override
  State<OrderTrackingScreen> createState() => _OrderTrackingScreenState();
}

class _OrderTrackingScreenState extends State<OrderTrackingScreen> {
  OrderDetails? _order;
  double? _driverLat;
  double? _driverLng;
  bool _loading = true;
  String? _error;
  Timer? _pollTimer;

  StreamSubscription<OrderStatusEvent>? _stSub;
  StreamSubscription<DriverLocationUpdate>? _locSub;
  StreamSubscription<DriverSnapshotEvent>? _snapSub;

  @override
  void initState() {
    super.initState();
    _order = widget.initialSnapshot;
    _load();
    _attachRealtime();
    _pollTimer = Timer.periodic(const Duration(seconds: 20), (_) => _load(silent: true));
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) setState(() => _loading = true);
    try {
      final d = await widget.orderRepository.getOrderDetails(widget.orderId);
      if (!mounted) return;
      setState(() {
        _order = d;
        _error = null;
        if (!silent) _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      if (e is AppException) {
        setState(() {
          _error = e.userFriendlyMessage;
          if (!silent) _loading = false;
        });
      }
    } finally {
      if (mounted && !silent) setState(() => _loading = false);
    }
  }

  void _attachRealtime() {
    final rt = widget.passengerRealtime;
    if (rt == null) return;
    rt.subscribeToOrder(widget.orderId);

    _stSub = rt.orderStatusStream.listen((ev) {
      if (!mounted || ev.orderId != widget.orderId) return;
      final o = _order;
      if (o == null) return;
      setState(() {
        _order = o.copyWith(
          status: ev.status,
          driverId: ev.driverId ?? o.driverId,
        );
      });
    });
    _locSub = rt.driverLocationStream.listen((u) {
      if (!mounted) return;
      setState(() {
        _driverLat = u.lat;
        _driverLng = u.lng;
      });
    });
    _snapSub = rt.driverSnapshotStream.listen((snap) {
      if (!mounted || snap.orderId != widget.orderId) return;
      final o = _order;
      if (o == null) return;
      setState(() {
        _order = o.copyWith(
          status: snap.status ?? o.status,
          driverId: snap.driverId ?? o.driverId,
        );
        if (snap.lat != null && snap.lng != null) {
          _driverLat = snap.lat;
          _driverLng = snap.lng;
        }
      });
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _stSub?.cancel();
    _locSub?.cancel();
    _snapSub?.cancel();
    super.dispose();
  }

  Widget _buildMap() {
    final session = widget.dgisSession;
    final ord = _order;

    double cLat = 55.755826;
    double cLng = 37.617298;
    double zoom = 14;
    final circles = <DgisCircleSpot>[];

    if (ord?.pickupLat != null &&
        ord?.pickupLng != null &&
        ord?.dropoffLat != null &&
        ord?.dropoffLng != null) {
      cLat = (ord!.pickupLat! + ord.dropoffLat!) / 2;
      cLng = (ord.pickupLng! + ord.dropoffLng!) / 2;
      zoom = 12.8;
      circles.add(DgisCircleSpot(
        latitude: ord.pickupLat!,
        longitude: ord.pickupLng!,
        fillArgb: 0x881B5E20,
        radiusMeters: 54,
      ));
      circles.add(DgisCircleSpot(
        latitude: ord.dropoffLat!,
        longitude: ord.dropoffLng!,
        fillArgb: 0x88C62828,
        radiusMeters: 54,
      ));
      if (_driverLat != null && _driverLng != null) {
        circles.add(DgisCircleSpot(
          latitude: _driverLat!,
          longitude: _driverLng!,
          fillArgb: 0x881E88E5,
          radiusMeters: 42,
        ));
      }
    }

    List<MapLatLng> routePts = [];
    if (ord?.pickupLat != null &&
        ord?.pickupLng != null &&
        ord?.dropoffLat != null &&
        ord?.dropoffLng != null) {
      routePts = [
        MapLatLng(ord!.pickupLat!, ord.pickupLng!),
        MapLatLng(ord.dropoffLat!, ord.dropoffLng!),
      ];
    }

    final primary = Theme.of(context).colorScheme.primary;
    final lineArgb = ((((primary.a * 255).round()) & 0xff) << 24) |
        ((((primary.r * 255).round()) & 0xff) << 16) |
        ((((primary.g * 255).round()) & 0xff) << 8) |
        (((primary.b * 255).round()) & 0xff);

    if (session == null) {
      final rasterSpots = circles
          .map(
            (c) => MapRasterSpot(
              latitude: c.latitude,
              longitude: c.longitude,
              fillColor: Color(c.fillArgb),
              radiusMeters: c.radiusMeters,
            ),
          )
          .toList();
      return RasterMapFallback(
        cameraLatitude: cLat,
        cameraLongitude: cLng,
        cameraZoom: zoom,
        spots: rasterSpots,
        routePoints: routePts,
        routeColor: primary,
      );
    }

    return DgisPlatformMap(
      session: session,
      scene: DgisMapScene(
        cameraLatitude: cLat,
        cameraLongitude: cLng,
        cameraZoom: zoom,
        circles: circles,
        routePoints: routePts,
        routeLineArgb: lineArgb,
        myLocationEnabled: true,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ord = _order;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Заказ в пути'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loading ? null : () => _load(),
          ),
        ],
      ),
      body: Column(
        children: [
          if (_loading && ord == null)
            const Expanded(child: Center(child: CircularProgressIndicator()))
          else
            Expanded(child: _buildMap()),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(8),
              child: Text(_error!, style: TextStyle(color: Colors.red[800])),
            ),
          if (ord != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Статус: ${ord.status}', style: Theme.of(context).textTheme.titleMedium),
                  if (ord.pickupAddress != null)
                    Text('Откуда: ${ord.pickupAddress}'),
                  if (ord.dropoffAddress != null)
                    Text('Куда: ${ord.dropoffAddress}'),
                  if (ord.price != null)
                    Text(
                      '${ord.price!.toStringAsFixed(0)} ₽',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                  if (_driverLat != null)
                    Text(
                      'Машина: ${_driverLat!.toStringAsFixed(4)}, ${_driverLng!.toStringAsFixed(4)}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
