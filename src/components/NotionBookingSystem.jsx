import React, { useState, useEffect } from 'react';

const NotionBookingSystem = () => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedStartTime, setSelectedStartTime] = useState('');
  const [selectedEndTime, setSelectedEndTime] = useState('');
  const [bookingData, setBookingData] = useState({});
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  
  // Notionからカレンダーデータを取得
  const [notionEvents, setNotionEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // システム設定（コードで直接変更）
  const settings = {
    immediateButtonText: '会議室Aを予約する',
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
      console.log('取得したNotionデータ:', data.results);
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
      
      // デバッグ用ログ
      console.log('チェック:', {
        targetTime: targetDateTime,
        eventStart: eventStart,
        eventEnd: eventEnd,
        targetTimeObj: targetTime.toISOString(),
        existingStartObj: existingStart.toISOString(),
        existingEndObj: existingEnd.toISOString(),
        isConflict: targetTime >= existingStart && targetTime < existingEnd
      });
      
      return targetTime >= existingStart && targetTime < existingEnd;
    });
    
    if (hasNotionEvent) return 'booked';
    return 'available';
  };

  // 時間スロットの色を決定
  const getSlotColor = (date, time) => {
    const status = getSlotStatus(date, time);
    if (status === 'booked' || status === 'holiday') return 'bg-gray-300 cursor-not-allowed';
    if (selectedDate && selectedTime && 
        selectedDate.toDateString() === date.toDateString() && 
        selectedTime === time) {
      return 'bg-blue-500 text-white';
    }
    return 'bg-teal-100 hover:bg-teal-200 cursor-pointer';
  };

  // 時間スロットクリック処理
  const handleTimeSlotClick = (date, time) => {
    const status = getSlotStatus(date, time);
    if (status === 'available') {
      setSelectedDate(date);
      setSelectedTime(time);
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

  const getDayName = (date) => {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[date.getDay()];
  };

  return (
    <div className="max-w-6xl mx-auto p-4 bg-white min-h-screen">
      {/* ヘッダー部分 */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">{settings.systemTitle}</h1>
        <p className="text-gray-600">{settings.description}</p>
      </div>

      {/* メインアクションボタン */}
      <button 
        className="w-full bg-blue-500 text-white py-4 px-6 rounded-xl mb-8 font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 shadow-lg"
        disabled={isLoading}
      >
        {isLoading ? '読み込み中...' : settings.immediateButtonText}
      </button>

      {/* 週選択 */}
      <div className="flex justify-between items-center mb-6 bg-gray-50 p-4 rounded-lg">
        <button 
          onClick={() => setWeekOffset(weekOffset - 1)}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm"
        >
          ← 前週
        </button>
        <span className="font-semibold text-lg">
          {weekDates && weekDates.length > 0 ? `${formatDate(weekDates[0])} - ${formatDate(weekDates[6])}` : '読み込み中...'}
        </span>
        <button 
          onClick={() => setWeekOffset(weekOffset + 1)}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm"
        >
          翌週 →
        </button>
      </div>

      {/* カレンダーグリッド - 時間表表示 */}
      <div className="border-2 border-gray-200 rounded-xl overflow-hidden shadow-lg mb-8">
        {/* ヘッダー */}
        <div className="grid grid-cols-8 bg-gray-100 border-b-2 border-gray-200">
          <div className="p-4 text-center font-bold text-gray-700">時間</div>
          {weekDates.map((date, index) => (
            <div key={index} className="p-4 text-center border-l border-gray-200">
              <div className="font-bold text-gray-800">{formatDate(date)}</div>
              <div className="text-sm text-gray-600">
                ({getDayName(date)})
                {isHoliday(date) && <span className="text-red-500 block text-xs">土日祝日</span>}
              </div>
            </div>
          ))}
        </div>

        {/* 時間スロット */}
        {timeOptions.map((time) => (
          <div key={time} className="grid grid-cols-8 border-b border-gray-200 hover:bg-gray-50">
            <div className="p-3 text-center font-semibold bg-blue-50 border-l-4 border-blue-500">{time}</div>
            {weekDates.map((date, dateIndex) => (
              <div key={dateIndex} className="p-3 text-center border-l border-gray-200">
                <div 
                  className={`w-8 h-8 rounded-full mx-auto flex items-center justify-center font-bold text-lg transition-all ${getSlotColor(date, time)}`}
                  onClick={() => handleTimeSlotClick(date, time)}
                >
                  {getSlotStatus(date, time) === 'available' ? '○' : '×'}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* 時間範囲選択予約フォーム */}
      {showBookingForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-2xl font-bold text-center mb-6 text-gray-800">予約情報入力</h3>
            
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-center text-lg font-semibold text-blue-800">
                📅 {selectedDate && formatDate(selectedDate)} ({selectedDate && getDayName(selectedDate)})
                {selectedStartTime && <><br/>⏰ 開始時間: {selectedStartTime}</>}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-lg font-semibold mb-3 text-gray-700">お名前 *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full p-4 border-2 border-gray-300 rounded-lg text-lg focus:border-blue-500 focus:outline-none"
                  placeholder="お名前を入力してください"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700">開始時間 *</label>
                  <input
                    type="text"
                    value={selectedStartTime}
                    readOnly
                    className="w-full p-3 border-2 border-gray-300 rounded-lg bg-gray-100 text-center font-semibold"
                    placeholder="時間を選択"
                  />
                  <p className="text-xs text-gray-500 mt-1">カレンダーで選択済み</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700">終了時間 *</label>
                  <select
                    value={selectedEndTime}
                    onChange={(e) => setSelectedEndTime(e.target.value)}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                    required
                  >
                    <option value="">選択してください</option>
                    {timeOptions.filter(time => !selectedStartTime || time > selectedStartTime).map((time) => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedStartTime && selectedEndTime && (
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-center text-green-700 font-semibold">
                    予約時間: {selectedStartTime} 〜 {selectedEndTime}
                  </p>
                </div>
              )}
            </div>

            <div className="flex space-x-4 mt-6">
              <button
                onClick={() => setShowBookingForm(false)}
                className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold"
              >
                キャンセル
              </button>
              <button
                onClick={handleBooking}
                disabled={!customerName.trim() || !selectedStartTime || !selectedEndTime || isLoading}
                className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              >
                {isLoading ? '予約中...' : '予約確定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 使い方説明 */}
      <div className="mt-8 p-6 bg-gray-50 rounded-xl">
        <h3 className="font-bold mb-4 text-lg text-gray-800">📋 予約方法</h3>
        <ul className="text-gray-600 space-y-2">
          <li className="flex items-center"><span className="text-green-500 mr-2">○</span>予約可能な時間をクリック</li>
          <li className="flex items-center"><span className="text-red-500 mr-2">×</span>予約済みまたは土日祝日</li>
          <li className="flex items-center"><span className="text-blue-500 mr-2">⏰</span>終了時間を選択して予約確定</li>
          <li className="flex items-center"><span className="text-orange-500 mr-2">📅</span>10:00-23:00の間で予約可能</li>
        </ul>
      </div>
    </div>
  );
};

export default NotionBookingSystem;