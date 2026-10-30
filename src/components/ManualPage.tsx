import { ArrowLeft, BookOpen, AlertTriangle, Clock, QrCode, Users, Zap, ShoppingCart, Store } from 'lucide-react'
import { useLocale } from '@/i18n/LocaleContext'

interface Section {
  icon: React.ReactNode
  titleJa: string
  titleEn: string
  steps: Array<{ ja: string; en: string }>
  notesJa?: string[]
  notesEn?: string[]
}

const SECTIONS: Section[] = [
  {
    icon: <Store size={16} />,
    titleJa: '1. 抽選を作成する',
    titleEn: '1. Create a Lottery',
    steps: [
      { ja: '「運営管理」タブを開き、「新規抽選を作成」ボタンをクリックします。', en: 'Open the "Operations" tab and click "New Lottery".' },
      { ja: '商品・抽選名、説明文、当選後の購入価格（USDC）、当選者数を入力します。', en: 'Enter the item name, description, price (USDC), and number of winners.' },
      { ja: '応募締切日時を設定します（必須）。応募開始日時は省略可能で、省略した場合は作成直後から応募を受け付けます。', en: 'Set the entry close date/time (required). Entry open is optional — if omitted, entries open immediately.' },
      { ja: '支払い期限の設定方法を選択します。「当選後〇時間」または「絶対日時指定」から選べます。', en: 'Choose a payment deadline mode: relative (hours after winning) or fixed date/time.' },
      { ja: '「抽選を作成する」ボタンを押してウォレットで承認します。', en: 'Click "Create Lottery" and approve in your wallet.' },
      { ja: '作成完了後、公開URLが表示されます。このURLを購入者に案内してください。', en: 'After creation, the public URL is shown. Share this URL with buyers.' },
    ],
  },
  {
    icon: <Store size={16} />,
    titleJa: '2. 公開URLを購入者に共有する',
    titleEn: '2. Share the Public URL',
    steps: [
      { ja: '各抽選の行を展開すると「公開URL」欄が表示されます。', en: 'Expand a lottery row to see the "Public URL" section.' },
      { ja: '「URLをコピー」ボタンでクリップボードにコピーできます。', en: 'Click "Copy URL" to copy it to your clipboard.' },
      { ja: 'SNS・チラシ・店頭QRコードなどで購入者に案内してください。', en: 'Share via SNS, flyers, or an in-store QR code.' },
      { ja: 'このURLを開いた購入者は、ウォレット未接続でも商品情報・応募条件を閲覧できます。', en: 'Buyers can view item info and conditions without connecting a wallet.' },
    ],
  },
  {
    icon: <Users size={16} />,
    titleJa: '3. 応募受付を確認する',
    titleEn: '3. Monitor Applications',
    steps: [
      { ja: '抽選行の「応募者数」が増えていることを確認します。', en: 'Check that the applicant count is increasing in the lottery row.' },
      { ja: '購入者は公開URLからウォレットを接続して「無料でエントリー」ボタンを押すことで応募します。', en: 'Buyers connect their wallet and press "Enter for Free" on the public URL.' },
      { ja: '1ウォレット1応募です。同じウォレットからの複数応募はコントラクトが拒否します。', en: 'One entry per wallet. Duplicate entries are rejected by the contract.' },
    ],
  },
  {
    icon: <Zap size={16} />,
    titleJa: '4. 応募を締め切って抽選を実行する',
    titleEn: '4. Close Entries & Run the Draw',
    steps: [
      { ja: '応募締切日時を過ぎると「応募を締め切って抽選する」ボタンが表示されます。', en: 'After the entry deadline, the "Close Entries & Run Draw" button appears.' },
      { ja: 'ボタンを押すと確認画面が表示されます。「この操作を実行すると新規応募ができなくなります」と表示されます。', en: 'A confirmation screen appears, warning that new entries will no longer be accepted.' },
      { ja: '「抽選を開始する」を押してウォレットで承認すると、乱数生成サービス（D20DAO）に抽選リクエストが送信されます。', en: 'Press "Run Draw" and approve in your wallet. A randomness request is sent to D20DAO.' },
      { ja: '乱数生成には通常数秒〜数十秒かかります。ステータスが「抽選中」から「当選確定中」に変わったら「当選者を確定する」を押します。', en: 'Randomness takes a few seconds to a minute. When status changes to "Confirming", press "Finalize Winners".' },
      { ja: '乱数生成の費用（約0.08 USDC）は抽選実行時にウォレットから直接支払われます。', en: 'The randomness fee (~0.08 USDC) is paid directly from your wallet at draw time.' },
    ],
    notesJa: [
      '応募締切前は抽選を実行できません（コントラクトで強制されます）。',
      '抽選を開始すると、応募者リストは凍結されます。抽選後に応募を受け付けることはできません。',
    ],
    notesEn: [
      'Drawing before the entry deadline is blocked by the contract.',
      'Once the draw starts, the applicant list is frozen. No new entries are accepted after this.',
    ],
  },
  {
    icon: <ShoppingCart size={16} />,
    titleJa: '5. 当選者のUSDC購入を待つ',
    titleEn: '5. Wait for Winner Payments',
    steps: [
      { ja: '当選者は公開URLの購入者ページで当選結果を確認できます。', en: 'Winners can see their result on the buyer page via the public URL.' },
      { ja: '当選者は「チケットを購入する」ボタンからUSDCで支払いを行います（USDC承認→購入の2ステップ）。', en: 'Winners pay with USDC via "Buy Ticket" (2 steps: approve then buy).' },
      { ja: '支払い完了後、購入者のウォレットにSBTチケットが発行されます。', en: 'After payment, an SBT ticket is issued to the buyer\'s wallet.' },
      { ja: '支払い期限を過ぎた当選者のスロットは、補欠リストの次の方に繰り上がります（「補欠を繰り上げる」ボタンで手動実行）。', en: 'Unpaid slots after the deadline can be promoted from the waitlist ("Promote from Waitlist" button).' },
    ],
  },
  {
    icon: <QrCode size={16} />,
    titleJa: '6. QRコードを読み取って引換を実行する',
    titleEn: '6. Scan QR Code & Redeem',
    steps: [
      { ja: '会場スタッフ用ウォレットを接続して「QR引換」タブを開きます。', en: 'Connect a venue staff wallet and open the "QR Redeem" tab.' },
      { ja: '購入者のスマートフォンに表示されたQRコードを読み取ります。', en: 'Scan the QR code displayed on the buyer\'s smartphone.' },
      { ja: 'チケット情報が表示されたら内容を確認し、「チケットを引換」ボタンを押します。', en: 'Verify the ticket info and press "Redeem Ticket".' },
      { ja: 'ウォレットで承認するとオンチェーンで引換が記録されます。', en: 'Approve in your wallet to record redemption onchain.' },
      { ja: 'QR署名には5分間の有効期限があります。期限切れの場合は購入者に再署名を依頼してください。', en: 'QR signatures expire in 5 minutes. Ask the buyer to re-sign if expired.' },
    ],
    notesJa: [
      'QR引換を実行するには、会場スタッフとして事前に登録が必要です（次セクション参照）。',
      '引換は1回のみ有効です。同じチケットを2回引換しようとするとエラーになります。',
    ],
    notesEn: [
      'You must be registered as a venue staff member to redeem (see next section).',
      'Each ticket can only be redeemed once. Attempting a second redemption causes an error.',
    ],
  },
  {
    icon: <Users size={16} />,
    titleJa: '7. 会場スタッフを登録・管理する',
    titleEn: '7. Manage Venue Staff',
    steps: [
      { ja: '各抽選の行を展開すると「会場スタッフ（QR引換権限）」欄が表示されます。', en: 'Expand a lottery row to see the "Venue Staff" section.' },
      { ja: 'スタッフのウォレットアドレス（0x...）を入力して「追加」ボタンを押します。', en: 'Enter the staff\'s wallet address (0x...) and click "Add".' },
      { ja: '登録されたウォレットだけがQR引換を実行できます。', en: 'Only registered wallets can perform QR redemptions.' },
      { ja: 'ロット作成者（店舗ウォレット）自身も、必要であれば自分のアドレスを会場スタッフとして登録してください。', en: 'The lot creator must also register their own address as venue staff if they plan to redeem.' },
    ],
  },
]

const WARNING_JA = [
  '応募開始前にキャンセルする手段は現在ありません。抽選を作成する前に内容をよく確認してください。',
  '応募受付中（OPEN状態）に抽選をキャンセルする機能は現在のコントラクトにはありません。',
  '抽選実行後（DRAWING/ACTIVE状態）に「closeLot」でロットを終了できますが、購入済みのSBTは残ります。',
  '公開URLを削除しても、ブロックチェーン上のデータは消えません。',
]
const WARNING_EN = [
  'There is currently no way to cancel a lottery before entry opens. Review all details before creating.',
  'The current contract has no cancel function while entries are open (OPEN state).',
  'After drawing, you can close the lot with "closeLot" (ACTIVE/WORD_RECEIVED only), but issued SBTs remain.',
  'Deleting the public URL does not erase data from the blockchain.',
]

export function ManualPage({ onBack }: { onBack: () => void }) {
  const { locale } = useLocale()
  const isJa = locale === 'ja'

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 hover:text-gray-700"
      >
        <ArrowLeft size={16} /> {isJa ? '管理画面に戻る' : 'Back to dashboard'}
      </button>

      <div className="flex items-center gap-2 mb-6">
        <BookOpen size={20} className="text-violet-600" />
        <h1 className="text-xl font-semibold text-gray-900">
          {isJa ? 'Arc LuckyPass 使い方ガイド' : 'Arc LuckyPass — How to Use'}
        </h1>
      </div>

      <div className="space-y-6">
        {SECTIONS.map((section, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2 text-violet-700 font-semibold text-sm">
              {section.icon}
              {isJa ? section.titleJa : section.titleEn}
            </div>
            <ol className="space-y-2">
              {(isJa ? section.steps.map(s => s.ja) : section.steps.map(s => s.en)).map((step, j) => (
                <li key={j} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-violet-400 font-mono text-xs mt-0.5 shrink-0">{j + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            {((isJa ? section.notesJa : section.notesEn) ?? []).length > 0 && (
              <div className="bg-amber-50 rounded-xl p-3 space-y-1">
                {(isJa ? section.notesJa! : section.notesEn!).map((note, j) => (
                  <p key={j} className="text-xs text-amber-700 flex items-start gap-1.5">
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                    {note}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* キャンセル機能の制約 */}
        <div className="bg-red-50 border border-red-100 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
            <AlertTriangle size={16} />
            {isJa ? '操作上の注意とキャンセル機能の制約' : 'Important Notes & Cancellation Constraints'}
          </div>
          <ul className="space-y-2">
            {(isJa ? WARNING_JA : WARNING_EN).map((w, i) => (
              <li key={i} className="flex gap-2 text-sm text-red-700">
                <span className="shrink-0 mt-0.5">•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* QR有効期限 */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2 text-blue-700 font-semibold text-sm">
            <Clock size={16} />
            {isJa ? 'QR署名の有効期限について' : 'About QR Signature Expiry'}
          </div>
          <p className="text-sm text-blue-700">
            {isJa
              ? '購入者がウォレットで署名したQRコードには5分間の有効期限があります。この期限内に会場スタッフがスキャン・引換を完了してください。期限切れの場合は購入者に再度署名（「署名してQRを生成」ボタン）を依頼してください。'
              : 'QR codes signed by the buyer expire after 5 minutes. Complete scanning and redemption within this window. If expired, ask the buyer to sign again ("Sign & Generate QR" button).'}
          </p>
        </div>
      </div>
    </div>
  )
}
