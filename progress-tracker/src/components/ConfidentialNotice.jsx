export default function ConfidentialNotice() {
  return (
    <div style={{
      background: '#fff2f0',
      border: '2px solid #cf1322',
      borderRadius: 8,
      padding: '8px 16px',
      marginBottom: 6,
      textAlign: 'center'
    }}>
      <span style={{
        color: '#cf1322',
        fontWeight: 700,
        fontSize: 14,
        letterSpacing: 1
      }}>
        ⚠ 保密提醒：涉密内容一律不上网，上网内容须删除敏感信息
      </span>
    </div>
  );
}
