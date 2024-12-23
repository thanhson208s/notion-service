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

    try {
        const response = await fetch("", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
    } catch (error) {
        
    }

    // try {
    //     const response = await fetch('https://your-server-domain.com/submit', {
    //         method: 'POST',
    //         headers: {
    //             'Content-Type': 'application/json'
    //         },
    //         body: JSON.stringify(formData)
    //     });

    //     const result = await response.json();
    //     showToast(result.ok ? 'Submission successful!' : `Error: ${result.reason}`);
    // } catch (error) {
    //     showToast('Submission failed! Please try again.');
    // }
}

function showToast(success) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

    if (success) {
        toast.classList.add('success');
        toast.classList.remove('error');
        toastMessage.textContent = 'New word added!';
    } else {
        toast.classList.add('error');
        toast.classList.remove('success');
        toastMessage.textContent = 'Error adding new word!';;
    }

    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
