const fs = require('fs');
const path = require('path');

async function uploadFile(fileName) {
  const filePath = path.join(__dirname, 'samples', fileName);
  const formData = new FormData();
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: fileName.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf' });
  formData.append('file', blob, fileName);

  try {
    console.log(`Starting upload for ${fileName}...`);
    const res = await fetch('http://localhost:3000/api/documents', {
      method: 'POST',
      body: formData
    });
    const text = await res.text();
    console.log(`Raw response for ${fileName}:`, text);
    try {
        const data = JSON.parse(text);
        return data;
    } catch(e) {
        console.error('Failed to parse json. continuing.');
    }
  } catch(e) {
    console.error('Error uploading', fileName, ':', e);
  }
}

async function run() {
  const docs = [
    'Anexo 2 - Plano de Coleta de Amostra de Fluido Multifásico.docx'
  ];
  
  let docIds = [];
  for (const doc of docs) {
    const data = await uploadFile(doc);
    if(data && data.id) docIds.push(data.id);
  }

  const chatPayload = {
    message: "O que este plano de coleta de amostra aborda e quais os principais procedimentos descritos?",
    selectedDocIds: docIds,
    customPrompt: ""
  };
  
  console.log('\nAsking question...', JSON.stringify(chatPayload));
  const res = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chatPayload)
  });
  
  const text = await res.text();
  console.log('\nResponse:\n', text);
}

run();
