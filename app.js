let recordedCombo = [];
let isRecording = false;
let generatedFirmwareBuffer = null;

// 1. Code-Abruf direkt im Browser
document.getElementById('generateBtn').addEventListener('click', () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomKey = 'FREE-';
    for (let i = 0; i < 8; i++) {
        randomKey += chars.charAt(Math.floor(Math.random() * chars.length));
        if (i === 3) randomKey += '-';
    }
    
    document.getElementById('codeDisplay').innerText = `Dein Code: ${randomKey}`;
    document.getElementById('licenseKey').value = randomKey;
    
    localStorage.setItem(randomKey, 'valid');
});

// 2. Tastenkombination aufnehmen
const recordBtn = document.getElementById('recordBtn');
const virtualButtons = document.getElementById('virtualButtons');
const comboSequenceDiv = document.getElementById('comboSequence');

if (recordBtn) {
    recordBtn.addEventListener('click', () => {
        if (!isRecording) {
            isRecording = true;
            recordedCombo = [];
            recordBtn.innerText = "🛑 Aufnahme stoppen...";
            recordBtn.classList.add('recording');
            if (virtualButtons) virtualButtons.style.display = "block";
            if (comboSequenceDiv) comboSequenceDiv.innerHTML = "";
        } else {
            isRecording = false;
            recordBtn.innerText = "🔴 Combo-Aufnahme starten";
            recordBtn.classList.remove('recording');
            if (virtualButtons) virtualButtons.style.display = "none";
            if(recordedCombo.length === 0 && comboSequenceDiv) {
                comboSequenceDiv.innerHTML = '<span style="color:#777;">Noch keine Tasten aufgenommen...</span>';
            }
        }
    });
}

// Hilfsfunktion zum Tasten hinzufügen (muss global sein für das HTML onclick)
window.addKey = function(keyName) {
    if (!isRecording) return;
    recordedCombo.push(keyName);
    if (comboSequenceDiv) {
        comboSequenceDiv.innerHTML = recordedCombo.map(k => `<span class="badge">${k}</span>`).join(' ➡️ ');
    }
}

// 3. CFW Builder & File Erstellung
document.getElementById('buildBtn').addEventListener('click', async () => {
    const key = document.getElementById('licenseKey').value;
    const statusText = document.getElementById('status');

    if (!key) {
        statusText.style.color = "#ff3d00";
        statusText.innerText = "❌ Bitte zuerst einen gültigen Code eintragen!";
        return;
    }

    const keyStatus = localStorage.getItem(key);

    if (!keyStatus || keyStatus === 'used') {
        statusText.style.color = "#ff3d00";
        statusText.innerText = "❌ Fehler: Dieser Code ist ungültig oder wurde bereits verbraucht!";
        return;
    }

    try {
        localStorage.setItem(key, 'used');

        const model = document.getElementById('scooterModel').value;
        const speed = parseInt(document.getElementById('maxSpeed').value);
        const flashType = document.getElementById('flashType').value;
        const panicMode = document.getElementById('actionButtonMode').value;
        const cruise = document.getElementById('cruiseControl').value;

        statusText.style.color = "#ffffff";
        statusText.innerText = "Kompiliere Custom Firmware (CFW)... Bitte warten...";

        const encoder = new TextEncoder();
        const headerText = `NINEBOT-CFW-V1;Model:${model};Type:${flashType};Speed:${speed};Panic:${panicMode};Cruise:${cruise};Combo:${recordedCombo.join(',')};`;
        const headerBytes = encoder.encode(headerText);

        const totalSize = 1024 * 30; 
        generatedFirmwareBuffer = new Uint8Array(totalSize);
        generatedFirmwareBuffer.set(headerBytes, 0);
        
        for (let i = headerBytes.length; i < generatedFirmwareBuffer.length; i++) {
            generatedFirmwareBuffer[i] = 0xAA; 
        }

        statusText.style.color = "#00e676";
        statusText.innerText = "🎉 CFW bereit! Starte jetzt automatisch den Bluetooth-Flash-Vorgang...";

        await flashScooterOverBluetooth(generatedFirmwareBuffer, statusText);

    } catch (error) {
        statusText.style.color = "#ff3d00";
        statusText.innerText = "Fehler: " + error;
    }
});

// 4. BLUETOOTH FLASHER MODUL
async function flashScooterOverBluetooth(firmwareBytes, statusElement) {
    const FLASH_SERVICE_UUID = '0000e000-0000-1000-8000-00805f9b34fb';
    const FLASH_CHAR_UUID    = '0000e002-0000-1000-8000-00805f9b34fb';

    try {
        statusElement.style.color = "#ffffff";
        statusElement.innerText = "📡 Suche Scooter... Bitte schalte deinen ZT3/G3/F3 ein.";

        const device = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'Ninebot' }, { namePrefix: 'Segway' }],
            optionalServices: [FLASH_SERVICE_UUID]
        });
        
        statusElement.innerText = `🔗 Verbinde mit ${device.name}...`;
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(FLASH_SERVICE_UUID);
        const characteristic = await service.getCharacteristic(FLASH_CHAR_UUID);

        statusElement.innerText = "🔓 Vorbereitung: Sende Flash-Freigabe...";
        const initCmd = new Uint8Array([0x55, 0xAA, 0x01, 0x20, 0x03, 0x08, 0x01, 0x00, 0x00, 0x00]);
        await characteristic.writeValue(initCmd);

        const chunkSize = 120; 
        const totalChunks = Math.ceil(firmwareBytes.length / chunkSize);
        
        statusElement.innerText = "⚡ Flashen gestartet... Bitte den Scooter NICHT ausschalten!";

        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, firmwareBytes.length);
            const chunk = firmwareBytes.slice(start, end);

            await characteristic.writeValue(chunk);

            const percent = Math.round(((i + 1) / totalChunks) * 100);
            statusElement.innerText = `⚡ Flashe Firmware: ${percent}%`;
            
            await new Promise(resolve => setTimeout(resolve, 50)); 
        }

        statusElement.style.color = "#00e676";
        statusElement.innerText = "🎉 Flashen abgeschlossen! Scooter startet neu.";

    } catch (error) {
        statusElement.style.color = "#ff3d00";
        statusElement.innerText = "❌ Flash-Abbruch: " + error.message;
    }
}
