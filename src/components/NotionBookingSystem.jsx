import React, { useState, useEffect } from 'react';

const NotionBookingSystem = () => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedStartTime, setSelectedStartTime] = useState('');
  const [selectedEndTime, setSelectedEndTime] = useState('');
  const [bookingData, setBookingData] = useState({});
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [showTimeSlots, setShowTimeSlots] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  
  // Notionからカレンダーデータを取得
  const [notionEvents, setNotionEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // システム設定（コードで直接変更）
  const settings = {
    startHour: 10,
    endHour: 23,
    systemTitle: '会議室A 予約システム',
    description: '使用する時間帯を選択してご予約ください'
  };

  // 祝日リスト（2025年の日本の祝日）
  const holidays2025 = [
    '2025-01-01', '2025-01-13', '2025-02-11', '2025-02-23',
    '2025-03-20', '2025-04-29', '2025-05-03', '2025-05-04',
    '2025-05-05', '2025-07-21', '2025-08-11', '2025-09-15',
    '2025-09-23', '2025-10-13', '2025-11-03', '2025-11-23',
  ];

  // Notion API設定
  const CALENDAR_DATABASE_ID = process.env.REACT_APP_NOTION_DATABASE_ID || '1f344ae2d2c780d5be3ffd5c8132f5f6';

  // 7日間の日付を生成
  const getCurrentWeekDates = () => {
    const today = new Date();
    const currentDay = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - currentDay + 1 + (weekOffset * 7));
    
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      weekDates.push(date);
    }
    return weekDates;
  };

  // 祝日かどうかをチェック（土日含む）
  const isHoliday = (date) => {
    const dateString = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay();
    return holidays2025.includes(dateString) || dayOfWeek === 0 || dayOfWeek === 6;
  };

  // 祝日のみチェック（土日は除外）
  const isActualHoliday = (date) => {
    const dateString = date.toISOString().split('T')[0];
    return holidays2025.includes(dateString);
  };

  // 時間オプションを生成（30分刻み）
  const generateTimeOptions = () => {
    const times = [];
    for (let hour = settings.startHour; hour <= settings.endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        if (hour === settings.endHour && minute > 0) break;
        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        times.push(time);
      }
    }
    return times;
  };

  const weekDates = getCurrentWeekDates();
  const timeOptions = generateTimeOptions();

  // Notionからカレンダーイベントを取得
  const fetchNotionCalendar = async () => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/.netlify/functions/notion-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          databaseId: CALENDAR_DATABASE_ID,
          filter: {
            property: '日付',
            date: {
              on_or_after: weekDates[0].toISOString().split('T')[0],
              on_or_before: weekDates[6].toISOString().split('T')[0]
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error('Notion APIエラー');
      }

      const data = await response.json();
      setNotionEvents(data.results || []);

    } catch (error) {
      console.error('Notionカレンダーの取得に失敗:', error);
      setNotionEvents([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Notionに新しい予約を追加
  const createNotionEvent = async (bookingData) => {
    try {
      const response = await fetch('/.netlify/functions/notion-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parent: { database_id: CALENDAR_DATABASE_ID },
          properties: {
            '予定名': {
              title: [
                {
                  text: {
                    content: `${bookingData.customerName} (${bookingData.startTime}-${bookingData.endTime})`
                  }
                }
              ]
            },
            '日付': {
              date: {
                start: `${bookingData.date}T${bookingData.startTime}:00+09:00`,
                end: `${bookingData.date}T${bookingData.endTime}:00+09:00`
              }
            }
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Notion APIエラー詳細:', errorData);
        throw new Error('Notion APIエラー');
      }

      const result = await response.json();
      console.log('Notionに予約を作成:', result);
      return true;
    } catch (error) {
      console.error('Notion予約作成エラー:', error);
      return false;
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (weekDates && weekDates.length > 0) {
      fetchNotionCalendar();
    }
  }, [weekOffset]);

  // 時間の競合チェック
  const checkTimeConflict = (date, startTime, endTime) => {
    if (isHoliday(date)) return true;

    const targetStart = new Date(`${date.toISOString().split('T')[0]}T${startTime}:00`);
    const targetEnd = new Date(`${date.toISOString().split('T')[0]}T${endTime}:00`);

    return notionEvents.some(event => {
      const eventStart = event.properties['日付']?.date?.start;
      const eventEnd = event.properties['日付']?.date?.end;
      
      if (!eventStart || !eventEnd) return false;
      
      const existingStart = new Date(eventStart);
      const existingEnd = new Date(eventEnd);
      
      return (targetStart < existingEnd && targetEnd > existingStart);
    });
  };

  // 時間スロットの予約状況を確認
  const getSlotStatus = (date, time) => {
    if (isHoliday(date)) return 'holiday';
    
    const targetDateTime = `${date.toISOString().split('T')[0]}T${time}:00`;
    
    const hasNotionEvent = notionEvents.some(event => {
      const eventStart = event.properties['日付']?.date?.start;
      const eventEnd = event.properties['日付']?.date?.end;
      
      if (!eventStart || !eventEnd) return false;
      
      const existingStart = new Date(eventStart);
      const existingEnd = new Date(eventEnd);
      const targetTime = new Date(targetDateTime);
      
      return targetTime >= existingStart && targetTime < existingEnd;
    });
    
    if (hasNotionEvent) return 'booked';
    return 'available';
  };

  // 日付選択時の処理
  const handleDateSelect = (date) => {
    if (isHoliday(date)) return;
    setSelectedDate(date);
    setShowTimeSlots(true);
  };

  // 時間選択時の処理
  const handleTimeSelect = (time) => {
    const status = getSlotStatus(selectedDate, time);
    if (status === 'available') {
      setSelectedStartTime(time);
      setSelectedEndTime('');
      setShowBookingForm(true);
    }
  };

  // 予約処理
  const handleBooking = async () => {
    if (!selectedDate || !selectedStartTime || !selectedEndTime || !customerName.trim()) {
      alert('すべての項目を入力してください。');
      return;
    }

    if (selectedStartTime >= selectedEndTime) {
      alert('終了時間は開始時間より後に設定してください。');
      return;
    }

    if (checkTimeConflict(selectedDate, selectedStartTime, selectedEndTime)) {
      alert('選択した時間帯は既に予約が入っています。別の時間を選択してください。');
      return;
    }

    setIsLoading(true);
    
    try {
      const bookingDataObj = {
        date: selectedDate.toISOString().split('T')[0],
        startTime: selectedStartTime,
        endTime: selectedEndTime,
        customerName: customerName
      };
      
      const success = await createNotionEvent(bookingDataObj);
      
      if (success) {
        const bookingKey = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}-${selectedStartTime}-${selectedEndTime}`;
        setBookingData(prev => ({
          ...prev,
          [bookingKey]: 'booked'
        }));
        
        setShowBookingForm(false);
        setShowTimeSlots(false);
        setSelectedDate(null);
        setSelectedTime(null);
        setSelectedStartTime('');
        setSelectedEndTime('');
        setCustomerName('');
        
        alert('予約が完了しました！');
        await fetchNotionCalendar();
      } else {
        alert('予約の作成に失敗しました。もう一度お試しください。');
      }
    } catch (error) {
      console.error('予約エラー:', error);
      alert('予約の作成に失敗しました。もう一度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const formatFullDate = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
  };

  const getDayName = (date) => {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[date.getDay()];
  };

  const getDateStatus = (date) => {
    if (isHoliday(date)) return 'holiday';
    
    const availableSlots = timeOptions.filter(time => 
      getSlotStatus(date, time) === 'available'
    ).length;
    
    if (availableSlots === 0) return 'full';
    if (availableSlots <= 3) return 'few';
    return 'available';
  };

  const getDateStatusText = (date) => {
    const status = getDateStatus(date);
    if (isHoliday(date)) {
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) return '×';  // 土日は×のみ
      if (isActualHoliday(date)) return '祝日';  // 祝日は「祝日」表示
    }
    switch (status) {
      case 'full': return '×';
      case 'few': return '△';
      case 'available': return '○';
      default: return '○';
    }
  };

  const getDateColor = (date) => {
    const status = getDateStatus(date);
    const isSelected = selectedDate && selectedDate.toDateString() === date.toDateString();
    
    if (isSelected) return 'bg-blue-500 text-white border-blue-500';
    
    if (isHoliday(date)) {
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return 'bg-gray-200 text-gray-500 border-gray-300';
      }
      if (isActualHoliday(date)) {
        return 'bg-red-100 text-red-600 border-red-200';
      }
    }
    
    switch (status) {
      case 'full': return 'bg-red-50 text-red-600 border-red-200';
      case 'few': return 'bg-orange-50 text-orange-600 border-orange-200';
      case 'available': return 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100';
      default: return 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto bg-white min-h-screen">
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 sticky top-0 z-40">
          <div className="text-center">
            <h1 className="text-xl font-bold">{settings.systemTitle}</h1>
            <p className="text-blue-100 text-sm mt-1">{settings.description}</p>
          </div>
        </div>

        {/* メインコンテンツ */}
        <div className="p-4">
          {!showTimeSlots && !showBookingForm && (
            <>
              {/* 週選択 */}
              <div className="flex justify-between items-center mb-4 bg-white rounded-lg shadow-sm border p-3">
                <button 
                  onClick={() => setWeekOffset(weekOffset - 1)}
                  className="px-3 py-2 bg-gray-100 rounded-lg text-gray-600 text-sm"
                >
                  ← 前週
                </button>
                <span className="font-bold text-gray-800">
                  {weekDates && weekDates.length > 0 ? `${formatDate(weekDates[0])} - ${formatDate(weekDates[6])}` : '読み込み中...'}
                </span>
                <button 
                  onClick={() => setWeekOffset(weekOffset + 1)}
                  className="px-3 py-2 bg-gray-100 rounded-lg text-gray-600 text-sm"
                >
                  翌週 →
                </button>
              </div>

              {/* 凡例 */}
              <div className="bg-white rounded-lg shadow-sm border p-3 mb-4">
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="flex items-center">
                    <span className="w-4 h-4 bg-green-50 border border-green-200 rounded mr-1"></span>
                    <span className="text-gray-600">○ 空あり</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-4 h-4 bg-orange-50 border border-orange-200 rounded mr-1"></span>
                    <span className="text-gray-600">△ 残少</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-4 h-4 bg-red-50 border border-red-200 rounded mr-1"></span>
                    <span className="text-gray-600">× 満員</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-4 h-4 bg-red-100 border border-red-200 rounded mr-1"></span>
                    <span className="text-gray-600">祝日</span>
                  </div>
                </div>
              </div>

              {/* 日付選択 */}
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-gray-800 mb-3">📅 日付を選択</h2>
                {weekDates.map((date, index) => (
                  <button
                    key={index}
                    onClick={() => handleDateSelect(date)}
                    disabled={isHoliday(date) || getDateStatus(date) === 'full'}
                    className={`w-full p-4 rounded-lg border-2 transition-all text-left ${getDateColor(date)} ${isHoliday(date) || getDateStatus(date) === 'full' ? 'cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-bold text-lg">
                          {formatDate(date)} ({getDayName(date)})
                        </div>
                        <div className="text-sm opacity-75">
                          {formatFullDate(date)}
                        </div>
                      </div>
                      <div className="text-2xl font-bold">
                        {getDateStatusText(date)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* 時間選択画面 */}
          {showTimeSlots && !showBookingForm && (
            <div>
              <div className="flex items-center mb-4">
                <button
                  onClick={() => {
                    setShowTimeSlots(false);
                    setSelectedDate(null);
                  }}
                  className="mr-3 p-2 text-gray-600"
                >
                  ← 戻る
                </button>
                <div>
                  <h2 className="text-lg font-bold text-gray-800">⏰ 時間を選択</h2>
                  <p className="text-sm text-gray-600">
                    {selectedDate && formatFullDate(selectedDate)} ({selectedDate && getDayName(selectedDate)})
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {timeOptions.map((time) => {
                  const status = getSlotStatus(selectedDate, time);
                  const isAvailable = status === 'available';
                  
                  return (
                    <button
                      key={time}
                      onClick={() => handleTimeSelect(time)}
                      disabled={!isAvailable}
                      className={`p-4 rounded-lg border-2 font-bold text-lg transition-all ${
                        isAvailable
                          ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100 active:scale-95'
                          : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                      }`}
                    >
                      <div>{time}</div>
                      <div className="text-xs mt-1">
                        {isAvailable ? '予約可能' : '予約済み'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 予約フォーム */}
          {showBookingForm && (
            <div>
              <div className="flex items-center mb-4">
                <button
                  onClick={() => {
                    setShowBookingForm(false);
                    setSelectedStartTime('');
                    setSelectedEndTime('');
                  }}
                  className="mr-3 p-2 text-gray-600"
                >
                  ← 戻る
                </button>
                <h2 className="text-lg font-bold text-gray-800">📝 予約情報入力</h2>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="font-bold text-blue-800 mb-2">予約内容確認</div>
                <div className="text-blue-700">
                  📅 {selectedDate && formatFullDate(selectedDate)} ({selectedDate && getDayName(selectedDate)})
                </div>
                <div className="text-blue-700">
                  ⏰ 開始時間: {selectedStartTime}
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-gray-700 font-bold mb-3">お名前 *</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full p-4 border-2 border-gray-300 rounded-lg text-lg focus:border-blue-500 focus:outline-none"
                    placeholder="お名前を入力してください"
                    required
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-bold mb-3">終了時間 *</label>
                  <select
                    value={selectedEndTime}
                    onChange={(e) => setSelectedEndTime(e.target.value)}
                    className="w-full p-4 border-2 border-gray-300 rounded-lg text-lg focus:border-blue-500 focus:outline-none"
                    required
                  >
                    <option value="">選択してください</option>
                    {timeOptions.filter(time => !selectedStartTime || time > selectedStartTime).map((time) => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>

                {selectedStartTime && selectedEndTime && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="font-bold text-green-800">
                      予約時間: {selectedStartTime} 〜 {selectedEndTime}
                    </div>
                  </div>
                )}

                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowBookingForm(false)}
                    className="flex-1 py-4 border-2 border-gray-300 text-gray-700 rounded-lg font-bold text-lg"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleBooking}
                    disabled={!customerName.trim() || !selectedStartTime || !selectedEndTime || isLoading}
                    className="flex-1 py-4 bg-blue-500 text-white rounded-lg font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
                  >
                    {isLoading ? '予約中...' : '予約確定'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="p-4 bg-gray-100 text-center text-xs text-gray-600">
          <p>時間範囲で予約できます</p>
          <p>営業時間：{settings.startHour}:00 - {settings.endHour}:00</p>
        </div>
      </div>
    </div>
  );
};

export default NotionBookingSystem;