document.getElementById('notionForm').addEventListener('keydown', function(event) {
    if (event.key === 'Enter')
        event.preventDefault();
});

async function submitForm(isDraft) {
    const formData = {
        name: document.getElementById('name').value,
        ipa: document.getElementById('ipa').value,
        meaning: document.getElementById('meaning').value,
        examples: document.getElementById('examples').value,
        isDraft
    };

    const rawBytes = new TextEncoder().encode(JSON.stringify(formData));
    const hashedArray = await crypto.subtle.digest('SHA-256', rawBytes);
    const hashedBytes = Array.from(new Uint8Array(hashedArray));
    const hashedStr = hashedBytes.map(unit => unit.toString(16).padStart(2, "0")).join("");

    try {
        const response = await fetch("/", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-amz-content-sha256': hashedStr
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        showToast(response.ok, data.description);
        if (response.ok) {
            document.getElementById('name').value = "";
            document.getElementById('ipa').value = "";
            document.getElementById('meaning').value = "";
            document.getElementById('examples').value = "";
        }
        else throw new Error(data.message);
    } catch (error) {
        console.log("Error:", error);
    }
}

function showToast(success, message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

    if (success) {
        toast.classList.add('success');
        toast.classList.remove('error');
        toastMessage.textContent = message;
    } else {
        toast.classList.add('error');
        toast.classList.remove('success');
        toastMessage.textContent = message;
    }

    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}
