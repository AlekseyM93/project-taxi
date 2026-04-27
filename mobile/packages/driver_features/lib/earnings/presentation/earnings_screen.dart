import 'package:flutter/material.dart';

import '../../shift/domain/shift_repository.dart';

class EarningsScreen extends StatefulWidget {
  const EarningsScreen({super.key, required this.shiftRepository});

  final ShiftRepository shiftRepository;

  @override
  State<EarningsScreen> createState() => _EarningsScreenState();
}

class _EarningsScreenState extends State<EarningsScreen> {
  EarningsSummary? _summary;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadEarnings();
  }

  Future<void> _loadEarnings() async {
    setState(() => _isLoading = true);
    try {
      final summary = await widget.shiftRepository.getEarningsSummary();
      if (!mounted) return;
      setState(() {
        _summary = summary;
        _isLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Заработок')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _summary == null
              ? const Center(child: Text('Нет данных'))
              : Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Text(
                        '${_summary!.totalEarnings.toStringAsFixed(0)} ${_summary!.currency == "RUB" ? "₽" : _summary!.currency}',
                        style: const TextStyle(fontSize: 48, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Text('${_summary!.tripsCount} поездок', style: Theme.of(context).textTheme.titleMedium),
                      if (_summary!.periodLabel != null) ...[
                        const SizedBox(height: 4),
                        Text(_summary!.periodLabel!, style: Theme.of(context).textTheme.bodyMedium),
                      ],
                    ],
                  ),
                ),
    );
  }
}
