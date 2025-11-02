const net = require('node:net');

const originalListen = net.Server.prototype.listen;

net.Server.prototype.listen = function (...args) {
	if (args.length === 1 && typeof args[0] === 'function') {
		return originalListen.call(this, 0, '127.0.0.1', args[0]);
	}

	if (args.length === 2 && typeof args[0] === 'number' && typeof args[1] === 'function') {
		return originalListen.call(this, args[0], '127.0.0.1', args[1]);
	}

	if (
		args.length >= 3 &&
		typeof args[0] === 'number' &&
		typeof args[1] === 'string' &&
		typeof args[2] === 'function' &&
		(args[1] === '::' || args[1] === '0.0.0.0')
	) {
		args[1] = '127.0.0.1';
	}

	return originalListen.apply(this, args);
};
