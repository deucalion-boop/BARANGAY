(() => {
    const copyButton = document.getElementById('copy-address-btn');
    const address = document.getElementById('contact-address');
    const status = document.getElementById('copy-address-status');
    if (!copyButton || !address || !status) return;

    const selectAddress = () => {
        const selection = window.getSelection();
        if (selection) {
            const range = document.createRange();
            range.selectNodeContents(address);
            selection.removeAllRanges();
            selection.addRange(range);
        }
        status.textContent = 'Address selected. Copy it using your device\'s copy command.';
    };

    copyButton.addEventListener('click', async () => {
        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
            selectAddress();
            return;
        }
        try {
            await navigator.clipboard.writeText(address.textContent.trim());
            status.textContent = 'Address copied.';
        } catch {
            selectAddress();
        }
    });
})();
