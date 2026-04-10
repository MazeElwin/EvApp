function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        throw new Error('Wallet file is not valid JSON.');
    }
}

function extractWalletAddress(payload) {
    if (typeof payload === 'string') {
        return payload.trim();
    }

    if (!payload || typeof payload !== 'object') {
        throw new Error('Wallet file is invalid.');
    }

    const walletAddress = String(
        payload.walletAddress ||
        payload.wallet_address ||
        payload.walletHash ||
        payload.wallet_hash ||
        payload.hash ||
        payload.code ||
        payload.wallet ||
        ''
    ).trim();

    if (!walletAddress) {
        throw new Error('Wallet file does not contain a wallet address.');
    }

    return walletAddress;
}

export function parseWalletFile(text) {
    const parsed = safeJsonParse(text);
    const walletAddress = extractWalletAddress(parsed);

    return {
        walletAddress,
        parseStatus: 'Loaded wallet address successfully.'
    };
}

export function buildWalletFilePayload(walletAddress, machines = []) {
    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        walletAddress: String(walletAddress || '').trim(),
        machines: Array.isArray(machines) ? machines : []
    };
}