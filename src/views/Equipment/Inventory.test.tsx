import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {setCached,invalidateCache} from '../../api/cache'
import LiveInventory from './Inventory'
const mocks=vi.hoisted(()=>({inventory:vi.fn(),createEquipment:vi.fn(),updateEquipment:vi.fn(),photo:vi.fn()}))
vi.mock('./live',async()=>({...await vi.importActual('./live'),useLiveOrganization:()=>({api:mocks,organization:{id:'org',name:'Studio'},admin:true})}))
vi.mock('../../components/EquipmentQrScanner',()=>({default:()=>null}))
vi.mock('../../components/QRCodeGenerator',()=>({default:()=> <p>Private equipment QR label</p>}))
const item={id:'camera',equipmentCode:'CAM-1',name:'Live camera',category:'Camera & Accessories',status:'available',photoId:null,createdAt:'2026-10-28'}
beforeEach(()=>{vi.clearAllMocks();mocks.inventory.mockResolvedValue({items:[item],nextCursor:null});mocks.createEquipment.mockResolvedValue({...item,id:'new',equipmentCode:'NEW-1',name:'New camera'});mocks.updateEquipment.mockResolvedValue(item)})
afterEach(cleanup)
describe('Authenticated inventory',()=>{
 it('does not refetch indefinitely after storing the inventory cache',async()=>{
   invalidateCache()
   mocks.inventory.mockReset().mockResolvedValueOnce({items:[item],nextCursor:null}).mockImplementation(()=>new Promise(()=>{}))
   const view=render(<LiveInventory/>);try{await screen.findByRole('button',{name:'Live camera'});await new Promise(resolve=>setTimeout(resolve,30));expect(mocks.inventory).toHaveBeenCalledTimes(1)}finally{view.unmount();invalidateCache()}
 })

 it('creates equipment through the selected organization API',async()=>{const user=userEvent.setup();render(<LiveInventory/>);await screen.findByRole('button',{name:'Live camera'});await user.click(screen.getByRole('button',{name:'Add item'}));await user.type(screen.getByLabelText('Equipment code'),'NEW-1');await user.type(screen.getByLabelText('Item name'),'New camera');await user.click(screen.getByRole('button',{name:'Create equipment'}));await waitFor(()=>expect(mocks.createEquipment).toHaveBeenCalledWith('org',{equipmentCode:'NEW-1',name:'New camera',category:'Camera & Accessories'}))})
 it('loads photos through short-lived authenticated download authorization',async()=>{mocks.inventory.mockResolvedValue({items:[{...item,photoId:'private'}],nextCursor:null});mocks.photo.mockResolvedValue({url:'https://private.example.test/signed',expiresIn:60});render(<LiveInventory/>);fireEvent.click(await screen.findByRole('button',{name:'Live camera'}));expect(await screen.findByAltText('Live camera')).toHaveAttribute('src','https://private.example.test/signed');expect(mocks.photo).toHaveBeenCalledWith('org','camera')})
 it('renders cached photos immediately on inspection without waiting for the network',async()=>{

   try {
     setCached('photo:org:camera', { url: 'https://private.example.test/instant-cached.jpg', expiresAt: Date.now() + 60_000 })
     mocks.inventory.mockResolvedValue({items:[{...item,photoId:'private'}],nextCursor:null})
     mocks.photo.mockResolvedValue({url:'https://private.example.test/refreshed.jpg',expiresIn:60})
     render(<LiveInventory/>)
     fireEvent.click(await screen.findByRole('button',{name:'Live camera'}))
     expect(screen.getByAltText('Live camera')).toHaveAttribute('src','https://private.example.test/instant-cached.jpg')
     expect(screen.queryByText('Loading private photo…')).not.toBeInTheDocument()
     await waitFor(()=>expect(screen.getByAltText('Live camera')).toHaveAttribute('src','https://private.example.test/refreshed.jpg'))
     expect(mocks.photo).toHaveBeenCalledWith('org','camera')
     expect(mocks.photo).toHaveBeenCalledTimes(1)
   } finally {
     invalidateCache()

   }
 })
 it('shows a real service error without sample inventory',async()=>{mocks.inventory.mockRejectedValue(new Error('private details'));render(<LiveInventory/>);expect(await screen.findByRole('alert')).toHaveTextContent('service is unavailable');expect(screen.queryByRole('button',{name:'Live camera'})).not.toBeInTheDocument();expect(screen.queryByText('private details')).not.toBeInTheDocument()})
})
